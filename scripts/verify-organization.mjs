#!/usr/bin/env node
/**
 * Organization integration check.
 *
 * The Organization workspace was the last module holding business state in `localStorage`: an
 * administrator could rename the tenant and create branches that no other user could see. These
 * assertions prove the two capabilities the backend genuinely models — the organization profile
 * and branches — persist on the server and read back, and pin the absence of the entities the old
 * workspace displayed so a fixture cannot quietly return.
 *
 *   pnpm verify:organization
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The parsers the frontend repository uses, run over the live responses. */
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

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const slug = `org-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Org ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Org Admin',
      reason: 'organization verification',
    },
    PH,
  );
  check('onboard tenant', r.status, 201);
  const orgId = r.payload.organization.id;
  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  const AH = { 'x-csrf-token': r.payload.csrfToken };
  const org = (method, path, body) =>
    call(A, method, `/v1/organizations/${orgId}${path}`, body, method === 'GET' ? undefined : AH);

  console.log('\nprofile');
  r = await org('GET', '');
  check('read the organization', r.status, 200);
  check(
    'the profile parses for the frontend',
    contracts.parseOrganization(r.payload) !== null,
    true,
  );
  check('it carries the slug set at onboarding', r.payload?.slug, slug);

  r = await org('PATCH', '', { name: `Renamed ${slug}`, timezone: 'Asia/Dubai' });
  check('update the profile', r.status, 200);
  r = await org('GET', '');
  // The value survives on the server, which is the whole point: the previous screen stored it in
  // the browser, so nobody else ever saw a rename.
  check('the new name is read back from the server', r.payload?.name, `Renamed ${slug}`);
  check('and so is the new timezone', r.payload?.timezone, 'Asia/Dubai');

  console.log('\nbranches');
  r = await org('GET', '/branches');
  const seeded = (r.payload ?? []).length;
  check('branch list parses for the frontend', contracts.parseBranchList(r.payload) !== null, true);

  r = await org('POST', '/branches', { name: 'Second site', code: `S-${slug.slice(-4)}` });
  check('create a branch', r.status, [200, 201]);
  const branchId = r.payload?.id;
  r = await org('GET', '/branches');
  check('the branch is listed after a refetch', (r.payload ?? []).length, seeded + 1);

  r = await org('PATCH', `/branches/${branchId}`, { name: 'Second site renamed' });
  check('update the branch', r.status, 200);
  r = await org('GET', '/branches');
  check(
    'the branch rename persists',
    (r.payload ?? []).find((entry) => entry.id === branchId)?.name,
    'Second site renamed',
  );

  r = await org('POST', `/branches/${branchId}/deactivate`, { reason: 'Site closed' });
  check('retire the branch', r.status, [200, 201]);
  r = await org('GET', '/branches');
  check(
    'the retired branch reports its status rather than disappearing',
    (r.payload ?? []).find((entry) => entry.id === branchId)?.status,
    'DEACTIVATED',
  );

  console.log('\ntenant isolation');
  const slugB = `orgb-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Other ${slugB}`,
      slug: slugB,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slugB}.test`,
      adminDisplayName: 'Other',
      reason: 'isolation check',
    },
    PH,
  );
  const otherOrgId = r.payload.organization.id;
  const B = jar();
  r = await call(B, 'POST', '/v1/auth/login', {
    email: `admin@${slugB}.test`,
    password: r.payload.temporaryPassword,
  });
  const BH = { 'x-csrf-token': r.payload?.csrfToken };

  r = await call(B, 'GET', `/v1/organizations/${orgId}`);
  check('another tenant cannot read this organization', r.status, [403, 404]);
  r = await call(B, 'PATCH', `/v1/organizations/${orgId}`, { name: 'Hijacked' }, BH);
  check('nor rename it by supplying its id', r.status, [403, 404]);
  r = await call(B, 'GET', `/v1/organizations/${orgId}/branches`);
  check('nor list its branches', r.status, [403, 404]);
  r = await org('GET', '');
  check('and the original name is untouched', r.payload?.name, `Renamed ${slug}`);
  check(
    'the other tenant reads its own organization',
    (await call(B, 'GET', `/v1/organizations/${otherOrgId}`)).status,
    200,
  );

  console.log('\nentities the workspace no longer claims');
  for (const [label, path] of [
    ['departments', '/departments'],
    ['announcements', '/announcements'],
    ['milestones', '/milestones'],
    ['org chart', '/org-chart'],
  ]) {
    r = await org('GET', path);
    check(`${label} has no endpoint`, r.status, 404);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
