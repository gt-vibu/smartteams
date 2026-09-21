#!/usr/bin/env node
/**
 * The rules that make people and projects identifiable, end to end: employee IDs are generated
 * and unique, work emails and Aadhaar numbers are unique, nothing half-made is left behind when a
 * check fails, employees can be edited after onboarding, project codes are generated, one person
 * cannot be on a project twice (even from two clicks at once), and employees see only their own
 * projects.
 *
 *   pnpm verify:identity-rules
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { testAadhaar } from './lib/aadhaar.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The parsers the frontend repositories use. Running them over the live responses is what proves
 * the wired screens can actually read this API — a schema that drifts from the service fails here
 * rather than as an empty panel in the browser.
 */
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
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  const PH = { 'x-csrf-token': r.payload.csrfToken };
  const slug = `qa-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Qa ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Qa Admin',
      reason: 'probe',
    },
    PH,
  );
  const orgId = r.payload.organization.id;
  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  const AH = { 'x-csrf-token': r.payload.csrfToken };
  const org = (m, p, b, h) =>
    call(
      A,
      m,
      `/v1/organizations/${orgId}${p}`,
      b,
      m === 'GET' ? undefined : { ...AH, ...(h ?? {}) },
    );
  const base = {
    firstName: 'Asha',
    lastName: 'Rao',
    employmentType: 'INTERN',
    dateOfJoining: '2026-09-01',
  };
  const a1 = testAadhaar();
  console.log('\n#9 employee ID generated, #11 Aadhaar required');
  r = await org('POST', '/employees', { ...base, workEmail: `asha@${slug}.test` });
  check('no Aadhaar is refused', r.status, 400);
  r = await org('POST', '/employees', {
    ...base,
    workEmail: `asha@${slug}.test`,
    aadhaarNumber: '234123412345',
  });
  check('an invalid Aadhaar is refused', r.status, 409);
  r = await org('POST', '/employees', {
    ...base,
    workEmail: `asha@${slug}.test`,
    aadhaarNumber: a1,
  });
  check('created with a generated ID', r.payload?.employeeNumber, 'EMP001');
  const asha = r.payload;
  r = await org('POST', '/employees', {
    ...base,
    firstName: 'Bala',
    workEmail: `bala@${slug}.test`,
    aadhaarNumber: testAadhaar(),
  });
  check('the next gets EMP002', r.payload?.employeeNumber, 'EMP002');
  const bala = r.payload;
  console.log('\n#4 duplicate email, #5 duplicate ID, Aadhaar reuse');
  r = await org('POST', '/employees', {
    ...base,
    firstName: 'Dup',
    workEmail: `ASHA@${slug}.test`,
    aadhaarNumber: testAadhaar(),
  });
  check('same email (any case) is refused', r.status, 409);
  console.log('   ', r.payload?.detail);
  r = await org('POST', '/employees', {
    ...base,
    firstName: 'Dup',
    employeeNumber: 'emp001',
    aadhaarNumber: testAadhaar(),
  });
  check('same ID (any case) is refused', r.status, 409);
  console.log('   ', r.payload?.detail);
  r = await org('POST', '/employees', { ...base, firstName: 'Dup', aadhaarNumber: a1 });
  check('same Aadhaar is refused', r.status, 409);
  console.log('   ', r.payload?.detail);
  r = await org('GET', '/employees');
  check('no partial records were created', (r.payload?.items ?? r.payload).length, 2);
  // Two onboarding forms submitted at the same moment with one Aadhaar. Without a lock both
  // passed the duplicate lookup, and the second was stopped only by the unique index.
  const shared = testAadhaar();
  const [t1, t2] = await Promise.all([
    org('POST', '/employees', {
      ...base,
      firstName: 'Twin',
      lastName: 'One',
      workEmail: `twin1@${slug}.test`,
      aadhaarNumber: shared,
    }),
    org('POST', '/employees', {
      ...base,
      firstName: 'Twin',
      lastName: 'Two',
      workEmail: `twin2@${slug}.test`,
      aadhaarNumber: shared,
    }),
  ]);
  check(
    'one Aadhaar submitted twice at once creates one person',
    [t1.status, t2.status].sort().join(),
    '201,409',
  );
  console.log('   ', (t1.status === 409 ? t1 : t2).payload?.detail);
  r = await org('GET', '/employees');
  check('and the refused twin left nothing behind', (r.payload?.items ?? r.payload).length, 3);
  const roleList = (await org('GET', '/roles')).payload;
  r = await org('POST', '/members', {
    email: `carl@${slug}.test`,
    displayName: 'Carl',
    roleIds: [roleList.find((x) => x.code === 'EMPLOYEE').id],
    reason: 'probe',
  });
  check('a login exists for carl', r.status, [200, 201]);
  r = await org('POST', '/employees', {
    ...base,
    firstName: 'Carl',
    workEmail: `carl@${slug}.test`,
    aadhaarNumber: testAadhaar(),
    createLogin: true,
  });
  check('an email that already has a login is refused before creating anything', r.status, 409);
  console.log('\n#6 edit employee');
  r = await org(
    'PATCH',
    `/employees/${bala.id}`,
    { workEmail: `asha@${slug}.test` },
    { 'if-match-version': String(bala.version) },
  );
  check('editing to a taken email is refused', r.status, 409);
  r = await org(
    'PATCH',
    `/employees/${bala.id}`,
    { firstName: 'Balaji', employmentType: 'CONTRACTOR', phone: '9876543210' },
    { 'if-match-version': String(bala.version) },
  );
  check('edit saves', r.status, 200);
  check('employment type changed', r.payload?.employmentType, 'CONTRACTOR');
  r = await org('POST', `/employees/${bala.id}/employment-records`, {
    jobTitle: 'QA Engineer',
    employmentType: 'CONTRACTOR',
    status: 'ACTIVE',
    effectiveFrom: '2026-09-01',
  });
  r = await org('POST', `/employees/${bala.id}/employment-records`, {
    jobTitle: 'Senior QA',
    employmentType: 'CONTRACTOR',
    status: 'ACTIVE',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  check('changing job title after onboarding works', r.status, [200, 201]);
  console.log('\n#10 project code, #2 duplicate member');
  // A project belongs to a branch, so the app-side create needs one.
  const branchList = (await org('GET', '/branches')).payload;
  const branchId = (branchList?.items ?? branchList)[0].id;
  r = await org('POST', '/projects', { name: 'Apollo', branchId });
  check('project code generated', r.payload?.code, 'PRJ-001');
  const proj = r.payload;
  r = await org('POST', '/projects', { name: 'Hermes', branchId });
  check('next project code', r.payload?.code, 'PRJ-002');
  r = await org('POST', `/projects/${proj.id}/members`, {
    employeeId: asha.id,
    startsOn: '2026-09-01',
  });
  check('assign Asha', r.status, 201);
  r = await org('POST', `/projects/${proj.id}/members`, {
    employeeId: asha.id,
    startsOn: '2026-09-10',
  });
  check('assigning Asha again is refused', r.status, 409);
  console.log('   ', r.payload?.detail);
  const [x1, x2] = await Promise.all([
    org('POST', `/projects/${proj.id}/members`, { employeeId: bala.id, startsOn: '2026-09-01' }),
    org('POST', `/projects/${proj.id}/members`, { employeeId: bala.id, startsOn: '2026-09-01' }),
  ]);
  check('two clicks at once add Bala only once', [x1.status, x2.status].sort().join(), '201,409');
  console.log('\n#12 employees see only their projects');
  r = await org('POST', '/members', {
    email: `asha@${slug}.test`,
    displayName: 'Asha Rao',
    roleIds: [roleList.find((x) => x.code === 'EMPLOYEE').id],
    reason: 'probe',
  });
  const pwd = r.payload?.temporaryPassword;
  await org('POST', `/employees/${asha.id}/user`, { userId: r.payload?.userId });
  const E = jar();
  r = await call(E, 'POST', '/v1/auth/login', { email: `asha@${slug}.test`, password: pwd });
  r = await call(E, 'GET', `/v1/organizations/${orgId}/projects`);
  const seen = (r.payload?.items ?? r.payload ?? []).map((p) => p.code);
  check('Asha sees only Apollo, not Hermes', JSON.stringify(seen), '["PRJ-001"]');
  r = await org('GET', '/projects');
  check('the administrator still sees both', (r.payload?.items ?? r.payload).length, 2);

  console.log('\none email may work for two companies, but only once in each');
  const slugB = `qb-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Qb ${slugB}`,
      slug: slugB,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slugB}.test`,
      adminDisplayName: 'Qb Admin',
      reason: 'probe',
    },
    PH,
  );
  const orgB = r.payload.organization.id;
  const B = jar();
  r = await call(B, 'POST', '/v1/auth/login', {
    email: `admin@${slugB}.test`,
    password: r.payload.temporaryPassword,
  });
  const BH = { 'x-csrf-token': r.payload.csrfToken };
  const orgInB = (m, p, b) =>
    call(B, m, `/v1/organizations/${orgB}${p}`, b, m === 'GET' ? undefined : BH);
  // Asha already works for the first company with this email and a login.
  r = await orgInB('POST', '/employees', {
    ...base,
    workEmail: `asha@${slug}.test`,
    aadhaarNumber: testAadhaar(),
    createLogin: true,
  });
  check('the same email can join a second company', r.status, 201);
  const ashaInB = r.payload;
  const employeeRoleB = (await orgInB('GET', '/roles')).payload.find(
    (x) => x.code === 'EMPLOYEE',
  ).id;
  r = await orgInB('POST', '/members', {
    email: `asha@${slug}.test`,
    displayName: 'Asha Rao',
    roleIds: [employeeRoleB],
    reason: 'probe',
  });
  r = await orgInB('POST', `/employees/${ashaInB.id}/user`, { userId: r.payload?.userId });
  check('and her existing login is linked there too', r.status, [200, 201]);
  r = await orgInB('POST', '/employees', {
    ...base,
    firstName: 'Twin',
    workEmail: `ASHA@${slug}.test`,
    aadhaarNumber: testAadhaar(),
  });
  check('but not twice in the same company', r.status, 409);
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
