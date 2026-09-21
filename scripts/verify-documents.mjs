#!/usr/bin/env node
/**
 * Document access, end to end against a running API and real object storage.
 *
 * Two tenants, and in the first: an administrator, HR, a manager and two employees, each with a
 * real login. Every flow is driven through the website's routes and the answers are asserted:
 * who can list, view, download, share and delete which file, and that none of it crosses
 * tenants, survives deletion, a revoked share or a removed permission.
 *
 *   pnpm verify:documents
 *
 * With DOCUMENTS_STORAGE=database the bytes are not sent to object storage: the upload is marked
 * complete directly in PostgreSQL, inside the tenant's row-level-security context. That proves
 * every authorization rule on a machine without storage credentials; run it against an API
 * started with placeholder credentials (they are enough to sign links, which is all it does).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { testAadhaar } from './lib/aadhaar.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FILES_API_URL ?? 'http://localhost:4000';
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const STORAGE_FREE = process.env.DOCUMENTS_STORAGE === 'database';
let database = null;
if (STORAGE_FREE) {
  const { Client } = createRequire(resolve(ROOT, 'apps/api/package.json'))('pg');
  database = new Client({ connectionString: resolveDatabaseUrl() });
  await database.connect();
}

/** Marks a pending upload available, as a completed upload would, in its tenant's context. */
async function completeInDatabase(orgId, fileId) {
  await database.query('BEGIN');
  await database.query("SELECT set_config('app.organization_id', $1, true)", [orgId]);
  await database.query(
    "UPDATE file_objects SET status = 'AVAILABLE' WHERE id = $1 AND status = 'PENDING_UPLOAD'",
    [fileId],
  );
  await database.query('COMMIT');
}

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

const slugOf = (prefix) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function login(email, password) {
  const J = jar();
  const r = await call(J, 'POST', '/v1/auth/login', { email, password });
  return { jar: J, headers: { 'x-csrf-token': r.payload?.csrfToken } };
}

async function tenant(P, PH, prefix) {
  const slug = slugOf(prefix);
  const r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Docs ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Docs Admin',
      reason: 'documents verification',
    },
    PH,
  );
  const session = await login(`admin@${slug}.test`, r.payload.temporaryPassword);
  return { orgId: r.payload.organization.id, slug, ...session };
}

const orgCall = (t, orgId) => (method, path, body) =>
  call(
    t.jar,
    method,
    `/v1/organizations/${orgId}${path}`,
    body,
    method === 'GET' ? undefined : t.headers,
  );

/** Begins a document upload, puts real bytes in storage, completes it. */
let A_ORG = null;

async function upload(as, body, orgId = A_ORG) {
  const bytes = randomBytes(2048);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const r = await as('POST', '/files/documents/uploads', {
    purpose: 'EMPLOYEE_DOCUMENT',
    originalName: body.name,
    contentType: 'application/pdf',
    byteSize: bytes.byteLength,
    checksumSha256: checksum,
    scope: body.scope,
    ...(body.purpose ? { purpose: body.purpose } : {}),
    ...(body.employeeId ? { employeeId: body.employeeId } : {}),
    ...(body.teamId ? { teamId: body.teamId } : {}),
    ...(body.allowDownload !== undefined ? { allowDownload: body.allowDownload } : {}),
  });
  if (r.status !== 201) return { status: r.status, payload: r.payload };
  if (STORAGE_FREE) {
    await completeInDatabase(orgId, r.payload.fileId);
    return { status: 201, fileId: r.payload.fileId };
  }
  const put = await fetch(r.payload.uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: {
      'Content-Type': 'application/pdf',
      'x-amz-server-side-encryption': 'AES256',
      'x-amz-checksum-sha256': Buffer.from(checksum, 'hex').toString('base64'),
    },
  });
  if (put.status !== 200) return { status: put.status };
  const done = await as('POST', `/files/${r.payload.fileId}/complete`);
  return { status: done.status, fileId: r.payload.fileId };
}

const ids = (r) => (Array.isArray(r.payload) ? r.payload.map((d) => d.id) : []);

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };
  const A = await tenant(P, PH, 'da');
  const B = await tenant(P, PH, 'db');
  A_ORG = A.orgId;
  const admin = orgCall(A, A.orgId);
  const adminB = orgCall(B, B.orgId);

  r = await admin('GET', '/roles');
  const roles = Object.fromEntries((r.payload ?? []).map((role) => [role.code, role]));
  check('standard roles exist', Boolean(roles.EMPLOYEE && roles.HR_ADMIN && roles.MANAGER), true);
  r = await admin('GET', '/branches');
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;

  /** An employee with a login in tenant A, holding one role. */
  async function person(first, roleCode) {
    const email = `${first.toLowerCase()}@${A.slug}.test`;
    let x = await admin('POST', '/employees', {
      employeeNumber: `E-${first}`,
      firstName: first,
      lastName: 'Test',
      workEmail: email,
      aadhaarNumber: testAadhaar(),
      employmentType: 'FULL_TIME',
      dateOfJoining: '2026-01-05',
      primaryBranchId: branchId,
    });
    const employeeId = x.payload?.id;
    x = await admin('POST', '/members', {
      email,
      displayName: `${first} Test`,
      roleIds: [roles[roleCode].id],
      reason: 'documents verification',
    });
    const userId = x.payload?.userId;
    await admin('POST', `/employees/${employeeId}/user`, { userId });
    const session = await login(email, x.payload?.temporaryPassword);
    return { employeeId, userId, as: orgCall(session, A.orgId) };
  }
  const vibu = await person('Vibu', 'EMPLOYEE');
  const asha = await person('Asha', 'EMPLOYEE');
  const hr = await person('Hema', 'HR_ADMIN');
  const manager = await person('Mani', 'MANAGER');
  check(
    'four people with logins',
    [vibu, asha, hr, manager].every((p) => p.employeeId && p.userId),
    true,
  );
  r = await admin('PUT', `/employees/${vibu.employeeId}/manager`, {
    managerEmployeeId: manager.employeeId,
  });
  check('Mani manages Vibu', r.status, [200, 201]);

  console.log('\nflow A - admin files an offer letter about Vibu');
  const offer = await upload(admin, {
    name: 'Offer_Letter.pdf',
    scope: 'EMPLOYEE',
    employeeId: vibu.employeeId,
  });
  check('uploaded', offer.status, [200, 201]);
  check(
    'Vibu sees it under My files',
    ids(await vibu.as('GET', '/files/documents?section=mine')).includes(offer.fileId),
    true,
  );
  check('Vibu can view it', (await vibu.as('POST', `/files/${offer.fileId}/view`)).status, 201);
  check(
    'Vibu can download it',
    (await vibu.as('POST', `/files/${offer.fileId}/download`)).status,
    201,
  );
  check(
    'Vibu cannot delete what HR filed',
    (await vibu.as('POST', `/files/${offer.fileId}/delete`, { reason: 'mine now' })).status,
    403,
  );
  check('HR can view it', (await hr.as('POST', `/files/${offer.fileId}/view`)).status, 201);
  check(
    'an unrelated employee gets not-found',
    (await asha.as('POST', `/files/${offer.fileId}/view`)).status,
    404,
  );
  check(
    'an unrelated employee does not see it listed',
    ids(await asha.as('GET', '/files/documents')).includes(offer.fileId),
    false,
  );
  check(
    'the manager cannot, without the reports permission',
    (await manager.as('POST', `/files/${offer.fileId}/view`)).status,
    404,
  );

  console.log('\nflow B - Vibu sends an address proof to HR');
  const proof = await upload(vibu.as, { name: 'AddressProof.pdf', scope: 'EMPLOYEE' });
  check('uploaded', proof.status, [200, 201]);
  check(
    'HR sees it under Employee files',
    ids(await hr.as('GET', '/files/documents?section=employees')).includes(proof.fileId),
    true,
  );
  check('Asha cannot open it', (await asha.as('POST', `/files/${proof.fileId}/view`)).status, 404);
  const forged = await upload(vibu.as, {
    name: 'x.pdf',
    scope: 'EMPLOYEE',
    employeeId: asha.employeeId,
  });
  check('Vibu cannot file a document against Asha (forged employeeId)', forged.status, 403);

  console.log('\nflow C - Vibu keeps a personal document');
  const personal = await upload(vibu.as, { name: 'PersonalDocument.pdf', scope: 'PERSONAL' });
  check('uploaded', personal.status, [200, 201]);
  check('Vibu can view it', (await vibu.as('POST', `/files/${personal.fileId}/view`)).status, 201);
  check(
    'the tenant administrator cannot',
    (await admin('POST', `/files/${personal.fileId}/view`)).status,
    404,
  );
  check('HR cannot', (await hr.as('POST', `/files/${personal.fileId}/view`)).status, 404);
  check(
    'the manager cannot',
    (await manager.as('POST', `/files/${personal.fileId}/view`)).status,
    404,
  );
  check(
    'it is not in the administrator list',
    ids(await admin('GET', '/files/documents')).includes(personal.fileId),
    false,
  );
  check(
    'nor in the old file list',
    ids(await admin('GET', '/files')).includes(personal.fileId),
    false,
  );

  console.log('\nflow D - the company handbook, view only');
  const handbook = await upload(admin, {
    name: 'Employee_Handbook.pdf',
    purpose: 'OTHER',
    scope: 'ORGANIZATION',
    allowDownload: false,
  });
  check('published', handbook.status, [200, 201]);
  check(
    'Asha sees it under Organization',
    ids(await asha.as('GET', '/files/documents?section=organization')).includes(handbook.fileId),
    true,
  );
  check('Asha can view it', (await asha.as('POST', `/files/${handbook.fileId}/view`)).status, 201);
  check(
    'Asha cannot download it (refused by the server)',
    (await asha.as('POST', `/files/${handbook.fileId}/download`)).status,
    403,
  );
  check(
    'the publisher can download it',
    (await admin('POST', `/files/${handbook.fileId}/download`)).status,
    201,
  );
  check(
    'an employee cannot publish company documents',
    (await upload(asha.as, { name: 'x.pdf', purpose: 'OTHER', scope: 'ORGANIZATION' })).status,
    403,
  );

  console.log('\nflow D2 - a team file shared with someone already on the team');
  const branchList = (await admin('GET', '/branches')).payload;
  const teamBranchId = (branchList?.items ?? branchList)[0]?.id;
  const team = (
    await admin('POST', '/teams', { name: `Docs QA ${Date.now()}`, branchId: teamBranchId })
  ).payload;
  await admin('POST', `/teams/${team.id}/members`, {
    employeeId: asha.employeeId,
    joinedAt: '2026-01-01',
  });
  const teamFile = await upload(admin, {
    name: 'TeamPlan.pdf',
    purpose: 'OTHER',
    scope: 'TEAM',
    teamId: team.id,
  });
  check('a team file is published', teamFile.status, [200, 201]);
  check(
    'Asha sees it under her teams',
    ids(await asha.as('GET', '/files/documents?section=team')).includes(teamFile.fileId),
    true,
  );
  r = await admin('POST', `/files/${teamFile.fileId}/shares`, {
    granteeType: 'USER',
    granteeId: asha.userId,
  });
  check('it is then shared with Asha by name', r.status, 201);
  // The share used to be invisible to her: the team route already explained the file, so the
  // decision reported TEAM and her Shared-with-me list stayed empty.
  check(
    'and it now also appears under Shared with me',
    ids(await asha.as('GET', '/files/documents?section=shared')).includes(teamFile.fileId),
    true,
  );

  console.log('\nflow E - sharing and revoking');
  r = await vibu.as('POST', `/files/${personal.fileId}/shares`, {
    granteeType: 'USER',
    granteeId: asha.userId,
  });
  check('Vibu shares the personal file with Asha', r.status, 201);
  const shareId = r.payload?.id;
  check(
    'Asha sees it under Shared with me',
    ids(await asha.as('GET', '/files/documents?section=shared')).includes(personal.fileId),
    true,
  );
  check('Asha can view it', (await asha.as('POST', `/files/${personal.fileId}/view`)).status, 201);
  check(
    'but not download it (shared without download)',
    (await asha.as('POST', `/files/${personal.fileId}/download`)).status,
    403,
  );
  check('HR still cannot', (await hr.as('POST', `/files/${personal.fileId}/view`)).status, 404);
  check(
    'Asha cannot reshare it',
    (
      await asha.as('POST', `/files/${personal.fileId}/shares`, {
        granteeType: 'USER',
        granteeId: hr.userId,
      })
    ).status,
    403,
  );
  r = await vibu.as('POST', `/files/${personal.fileId}/shares/${shareId}/revoke`);
  check('Vibu revokes the share', r.status, 201);
  check(
    'Asha loses access at once',
    (await asha.as('POST', `/files/${personal.fileId}/view`)).status,
    404,
  );
  r = await hr.as('POST', `/files/${proof.fileId}/shares`, {
    granteeType: 'ROLE',
    granteeId: roles.MANAGER.id,
    canDownload: true,
  });
  check('HR shares the address proof with the Manager role', r.status, 201);
  check(
    'the manager can now view it',
    (await manager.as('POST', `/files/${proof.fileId}/view`)).status,
    201,
  );
  check(
    'and download it',
    (await manager.as('POST', `/files/${proof.fileId}/download`)).status,
    201,
  );
  check(
    'an employee still cannot',
    (await asha.as('POST', `/files/${proof.fileId}/view`)).status,
    404,
  );
  r = await hr.as('POST', `/files/${proof.fileId}/shares`, {
    granteeType: 'USER',
    granteeId: B.orgId,
  });
  check('a share to someone outside the organization is refused', r.status, 404);

  console.log('\nflow F - manager access is a permission, not a title');
  const keys = roles.MANAGER.permissions.map((link) => link.permission.key);
  r = await admin('PUT', `/roles/${roles.MANAGER.id}/permissions`, {
    permissionKeys: [...keys, 'files.reports.read'],
    reason: 'let managers read their reports documents',
  });
  check('the administrator turns on reports access for managers', r.status, 200);
  check(
    'the manager can view Vibu offer letter',
    (await manager.as('POST', `/files/${offer.fileId}/view`)).status,
    201,
  );
  const ashaFile = await upload(admin, {
    name: 'Asha_Offer.pdf',
    scope: 'EMPLOYEE',
    employeeId: asha.employeeId,
  });
  check(
    'but not Asha, who does not report to them',
    (await manager.as('POST', `/files/${ashaFile.fileId}/view`)).status,
    404,
  );
  await admin('PUT', `/roles/${roles.MANAGER.id}/permissions`, {
    permissionKeys: keys,
    reason: 'restore manager permissions',
  });
  check(
    'turned off again, access ends on the next request',
    (await manager.as('POST', `/files/${offer.fileId}/view`)).status,
    404,
  );

  console.log('\npermission revocation');
  const employeeKeys = roles.EMPLOYEE.permissions.map((link) => link.permission.key);
  await admin('PUT', `/roles/${roles.EMPLOYEE.id}/permissions`, {
    permissionKeys: employeeKeys.filter((key) => key !== 'files.read'),
    reason: 'revocation test',
  });
  check(
    'without files.read, Asha cannot open the handbook',
    (await asha.as('POST', `/files/${handbook.fileId}/view`)).status,
    403,
  );
  await admin('PUT', `/roles/${roles.EMPLOYEE.id}/permissions`, {
    permissionKeys: employeeKeys,
    reason: 'restore employee permissions',
  });
  check(
    'restored, she can again',
    (await asha.as('POST', `/files/${handbook.fileId}/view`)).status,
    201,
  );

  console.log('\ntenant isolation');
  check(
    'tenant B cannot view A file through its own organization',
    (await adminB('POST', `/files/${handbook.fileId}/view`)).status,
    404,
  );
  check(
    'nor download it',
    (await adminB('POST', `/files/${handbook.fileId}/download`)).status,
    404,
  );
  check(
    'nor delete it',
    (await adminB('POST', `/files/${handbook.fileId}/delete`, { reason: 'cross tenant' })).status,
    404,
  );
  check(
    'nor share it',
    (
      await adminB('POST', `/files/${handbook.fileId}/shares`, {
        granteeType: 'USER',
        granteeId: B.orgId,
      })
    ).status,
    404,
  );
  check(
    'nor list it',
    ids(await adminB('GET', '/files/documents')).includes(handbook.fileId),
    false,
  );
  const intoA = orgCall(B, A.orgId);
  check(
    'and cannot address tenant A at all',
    (await intoA('GET', '/files/documents')).status,
    [401, 403, 404],
  );
  check(
    'a made-up file id is not-found',
    (await admin('POST', '/files/00000000-0000-4000-8000-000000000000/view')).status,
    404,
  );

  console.log('\nlifecycle');
  // Completion checks the stored object, so this part needs real storage.
  if (!STORAGE_FREE) {
    const twice = await admin('POST', '/files/documents/uploads', {
      purpose: 'OTHER',
      originalName: 'twice.pdf',
      contentType: 'application/pdf',
      byteSize: 16,
      scope: 'ORGANIZATION',
    });
    await fetch(twice.payload.uploadUrl, {
      method: 'PUT',
      body: Buffer.alloc(16, 1),
      headers: { 'Content-Type': 'application/pdf', 'x-amz-server-side-encryption': 'AES256' },
    });
    const [c1, c2] = await Promise.all([
      admin('POST', `/files/${twice.payload.fileId}/complete`),
      admin('POST', `/files/${twice.payload.fileId}/complete`),
    ]);
    check(
      'two completions at once both succeed',
      [c1.status, c2.status].every((s) => s === 200 || s === 201),
      true,
    );
    check(
      'and the file is listed once',
      ids(await admin('GET', '/files/documents')).filter((id) => id === twice.payload.fileId)
        .length,
      1,
    );
  }
  r = await vibu.as('POST', `/files/${proof.fileId}/delete`, { reason: 'sent the wrong file' });
  check('Vibu withdraws the address proof', r.status, [200, 201]);
  check(
    'deleted, it cannot be viewed',
    (await hr.as('POST', `/files/${proof.fileId}/view`)).status,
    404,
  );
  check('nor downloaded', (await hr.as('POST', `/files/${proof.fileId}/download`)).status, 404);

  await database?.end();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
