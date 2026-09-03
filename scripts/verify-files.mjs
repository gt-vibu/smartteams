#!/usr/bin/env node
/**
 * Files integration check.
 *
 * Runs the whole lifecycle against real object storage: a ticket is issued, real bytes are PUT
 * to the presigned URL, the upload is completed, the file is downloaded and the returned bytes
 * are compared to the ones sent, then it is deleted. Nothing here trusts the API's own account
 * of what it stored — the assertion that matters is that the bytes come back byte-for-byte.
 *
 * This used to stop at "the API issued a ticket", because the environment had no S3-compatible
 * store and five checks skipped. Skipping was hiding two real crashes, so the round trip is now
 * the point of the script rather than an extra.
 *
 * Needs the API, PostgreSQL, Redis and MinIO up:
 *
 *   docker compose up -d postgres redis minio minio-bucket
 *   pnpm verify:files
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runRoundTrip } from './files-round-trip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = createRequire(import.meta.url)(resolve(ROOT, 'packages/contracts/dist/index.js'));
const BASE = 'http://localhost:4000';
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

let passed = 0;
const failures = [];
const skipped = [];

const check = (label, actual, expected) => {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`  FAIL  ${label} -> ${JSON.stringify(actual)}`);
  }
};

const skip = (label, why) => {
  skipped.push(`${label} — ${why}`);
  console.log(`  skip  ${label}`);
};

function jar() {
  const s = new Map();
  return {
    absorb(r) {
      for (const raw of r.headers.getSetCookie?.() ?? []) {
        const [p] = raw.split(';');
        const i = p.indexOf('=');
        const n = p.slice(0, i).trim();
        const v = p.slice(i + 1).trim();
        if (v === '') s.delete(n);
        else s.set(n, v);
      }
    },
    header: () => [...s].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

async function call(j, method, path, body, extra) {
  const headers = { Accept: 'application/json', ...(extra ?? {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const c = j.header();
  if (c) headers.Cookie = c;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  j.absorb(r);
  let payload = null;
  try {
    payload = await r.json();
  } catch {}
  return { status: r.status, payload };
}

async function tenant(P, PH, prefix) {
  const slug = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Files ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Files Admin',
      reason: 'files verification',
    },
    PH,
  );
  const A = jar();
  const login = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  return {
    orgId: r.payload.organization.id,
    jar: A,
    headers: { 'x-csrf-token': login.payload.csrfToken },
  };
}

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const a = await tenant(P, PH, 'fa');
  const b = await tenant(P, PH, 'fb');
  check('onboard two tenants', Boolean(a.orgId && b.orgId), true);

  const org = (t, method, path, body) =>
    call(
      t.jar,
      method,
      `/v1/organizations/${t.orgId}${path}`,
      body,
      method === 'GET' ? undefined : t.headers,
    );

  console.log('\nserver-side validation, which runs before any storage call');
  r = await org(a, 'POST', '/files/uploads', {
    purpose: 'PROFILE_IMAGE',
    originalName: 'huge.png',
    contentType: 'image/png',
    byteSize: 999_999_999,
  });
  check('an oversized file is refused', r.status, [400, 409]);
  r = await org(a, 'POST', '/files/uploads', {
    purpose: 'PROFILE_IMAGE',
    originalName: 'script.exe',
    contentType: 'application/x-msdownload',
    byteSize: 1024,
  });
  check('a disallowed content type is refused', r.status, [400, 409]);
  r = await org(a, 'POST', '/files/uploads', {
    purpose: 'LEAVE_ATTACHMENT',
    originalName: 'note.pdf',
    contentType: 'application/pdf',
    byteSize: 1024,
  });
  check('a leave attachment without an owner is refused', r.status, [400, 409]);
  r = await org(a, 'POST', '/files/uploads', {
    purpose: 'NOT_A_PURPOSE',
    originalName: 'note.pdf',
    contentType: 'application/pdf',
    byteSize: 1024,
  });
  check('an unknown purpose is refused', r.status, [400, 409]);

  console.log('\nupload ticket');
  r = await org(a, 'POST', '/files/uploads', {
    purpose: 'EMPLOYEE_DOCUMENT',
    originalName: 'handbook.pdf',
    contentType: 'application/pdf',
    byteSize: 2048,
  });
  /*
   * Object storage is a requirement now, not a nice-to-have.
   *
   * This used to degrade to five skips when the API could not presign. That was the wrong
   * default: the skips were hiding two crashes that only appeared once the path actually ran, so
   * an unreachable store is reported as a failure with the fix in the message.
   */
  check('the API can presign an upload', r.status, [200, 201]);
  if (r.status !== 200 && r.status !== 201) {
    console.log(
      '\n  object storage is unreachable. Start it with:\n' +
        '    docker compose up -d minio minio-bucket\n',
    );
  } else {
    check(
      'the ticket parses for the frontend',
      contracts.parseFileUploadTicket(r.payload) !== null,
      true,
    );
    const fileId = r.payload?.fileId;
    check('it carries a presigned upload url', typeof r.payload?.uploadUrl, 'string');

    // The bytes were never sent, so the API must refuse to mark the file available.
    r = await org(a, 'POST', `/files/${fileId}/complete`);
    check('completing an unsent upload does not succeed', r.status >= 400, true);
    r = await org(a, 'POST', `/files/${fileId}/download`);
    check('a pending file cannot be downloaded', r.status, [404, 409]);

    r = await org(b, 'POST', `/files/${fileId}/download`);
    check("another tenant cannot download this tenant's file", r.status, [403, 404]);
    r = await org(b, 'POST', `/files/${fileId}/delete`, { reason: 'Not mine to delete' });
    check('nor delete it', r.status, [403, 404]);

    r = await org(a, 'POST', `/files/${fileId}/delete`, { reason: 'x' });
    check('a too-short deletion reason is refused', r.status, [400, 409]);
    r = await org(a, 'POST', `/files/${fileId}/delete`, { reason: 'Uploaded in error' });
    check('delete with a reason succeeds', r.status, [200, 201]);
    r = await org(a, 'POST', `/files/${fileId}/delete`, { reason: 'Uploaded in error' });
    check('a deleted file cannot be deleted twice', r.status, [404, 409]);

    console.log('\nthe real lifecycle, with bytes');
    await runRoundTrip({ check, contracts, org, a, b });
  }

  console.log('\nlisting, scoped the same way download is');
  // Listing was added only once `download` was self-scoped: on top of an unscoped read it would
  // have turned "guess a file id" into "enumerate every payslip in the tenant".
  r = await org(a, 'GET', '/files');
  check('an administrator can list tenant files', r.status, 200);
  check('an empty tenant lists nothing rather than samples', (r.payload ?? []).length, 0);
  r = await org(b, 'GET', '/files');
  check("another tenant's list is its own and empty", (r.payload ?? []).length, 0);
  r = await org(a, 'GET', '/documents');
  check('there is no separate documents route', r.status, 404);

  console.log(`\n${passed} passed, ${failures.length} failed, ${skipped.length} skipped`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  for (const entry of skipped) console.log(`  skip  ${entry}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
