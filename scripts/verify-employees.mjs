#!/usr/bin/env node
/**
 * Employees module integration check.
 *
 * Exercises the endpoints the profile and membership surfaces depend on against a live API:
 * employment records, optimistic-concurrency updates, membership add/end, and tenant isolation.
 * Run after any change to those services.
 *
 *   pnpm verify:employees
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    console.log(
      `  FAIL  ${label} -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    );
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
    get: (n) => s.get(n),
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

  const slug = `emp-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Employees ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Emp Admin',
      reason: 'employees module verification',
    },
    PH,
  );
  check('onboard tenant', r.status, 201);
  const orgId = r.payload.organization.id;
  const creds = { email: `admin@${slug}.test`, password: r.payload.temporaryPassword };

  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', creds);
  check('tenant login', r.status, 201);
  const AH = { 'x-csrf-token': r.payload.csrfToken };

  console.log('\n/me for an admin with no employee record');
  r = await call(A, 'GET', '/v1/auth/me');
  check('me', r.status, 200);
  // Drives the "No employee profile" state rather than an error.
  check('employee is null for a non-employee admin', r.payload.employee, null);

  console.log('\nemployee lifecycle');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/employees`);
  check('employee list', r.status, 200);
  // The directory is paged now, so the response is an envelope rather than a bare array.
  check(
    'new tenant starts with no employees',
    Array.isArray(r.payload?.items) ? r.payload.items.length : -1,
    0,
  );
  check('and offers no next page', r.payload?.nextCursor ?? null, null);

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/employees`,
    {
      employeeNumber: 'EMP-001',
      firstName: 'Asha',
      lastName: 'Rao',
      workEmail: `asha@${slug}.test`,
      employmentType: 'FULL_TIME',
      dateOfJoining: '2024-03-15',
    },
    AH,
  );
  check('create employee', r.status, 201);
  const employeeId = r.payload?.id;

  console.log('\nemployment records (new endpoint)');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/employees/${employeeId}/employment-records`);
  check('GET employment-records', r.status, 200);
  check(
    'empty before any record exists',
    Array.isArray(r.payload?.items ?? r.payload)
      ? (r.payload?.items ?? r.payload ?? []).length
      : -1,
    0,
  );

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/employees/${employeeId}/employment-records`,
    {
      jobTitle: 'Senior Engineer',
      department: 'Engineering',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      effectiveFrom: '2024-03-15',
    },
    AH,
  );
  check('POST employment-record', r.status, 201);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/employees/${employeeId}/employment-records`);
  check('record is readable after create', r.status, 200);
  check('jobTitle from API', (r.payload?.items ?? r.payload)?.[0]?.jobTitle, 'Senior Engineer');
  check('department from API', (r.payload?.items ?? r.payload)?.[0]?.department, 'Engineering');
  check(
    'effectiveFrom is the joining-date source',
    String((r.payload?.items ?? r.payload)?.[0]?.effectiveFrom).slice(0, 10),
    '2024-03-15',
  );

  console.log('\nprofile mutation persists');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/employees/${employeeId}`);
  const version = r.payload?.version;
  r = await call(
    A,
    'PATCH',
    `/v1/organizations/${orgId}/employees/${employeeId}`,
    { phone: '+91 90000 11111' },
    { ...AH, 'if-match-version': String(version) },
  );
  check('PATCH employee with if-match-version', r.status, 200);

  r = await call(
    A,
    'PATCH',
    `/v1/organizations/${orgId}/employees/${employeeId}`,
    { phone: '+91 90000 22222' },
    { ...AH, 'if-match-version': String(version) },
  );
  check('stale version is rejected, not silently applied', r.status, 409);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/employees/${employeeId}`);
  check('phone persisted (survives a fresh read)', r.payload?.phone, '+91 90000 11111');

  console.log('\nmembership add + end (new endpoint)');
  r = await call(A, 'POST', `/v1/organizations/${orgId}/teams`, { name: 'Platform' }, AH);
  check('create team', r.status, 201);
  const teamId = r.payload?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members`,
    {
      employeeId,
      joinedAt: '2024-04-01',
    },
    AH,
  );
  check('add team member', r.status, 201);
  const memberId = r.payload?.id;

  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check('team list includes members', (r.payload?.items ?? r.payload)?.[0]?.members?.length, 1);

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}/end`,
    {
      leftAt: '2026-06-30',
    },
    AH,
  );
  check('end team membership', r.status, 201);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}/end`,
    {
      leftAt: '2026-07-31',
    },
    AH,
  );
  check('ending twice is a conflict, not a silent success', r.status, 409);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check(
    'leftAt persisted',
    String((r.payload?.items ?? r.payload)?.[0]?.members?.[0]?.leftAt ?? '').slice(0, 10),
    '2026-06-30',
  );

  // Re-adding after an end must create a new row, not revive the closed one. The drawer relies
  // on this to distinguish ENDED from NOT_A_MEMBER.
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members`,
    {
      employeeId,
      joinedAt: '2026-08-01',
    },
    AH,
  );
  check('re-adding after an end is allowed', r.status, 201);
  const rejoinId = r.payload?.id;
  check('re-add creates a new membership row', rejoinId !== memberId, true);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check(
    'the closed row is retained alongside the new one',
    (r.payload?.items ?? r.payload)?.[0]?.members?.length,
    2,
  );

  // Postgres forbids overlapping membership periods. That is a domain conflict, so it must not
  // reach the client as a 500 with no explanation.
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members`,
    {
      employeeId,
      joinedAt: '2026-08-01',
    },
    AH,
  );
  check('an overlapping rejoin is a conflict, not a server error', r.status, 409);
  check(
    'the conflict explains itself',
    String(r.payload?.detail ?? r.payload?.message ?? '').includes('membership'),
    true,
  );

  console.log('\nproject allocation add + end');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects`,
    {
      code: 'VERIFY-1',
      name: 'Verification Project',
    },
    AH,
  );
  check('create project', r.status, 201);
  const projectId = r.payload?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members`,
    {
      employeeId,
      allocationPercentage: 60,
      startsOn: '2026-01-01',
    },
    AH,
  );
  check('add project member', r.status, 201);
  const projectMemberId = r.payload?.id;

  r = await call(A, 'GET', `/v1/organizations/${orgId}/projects`);
  check('project list includes members', (r.payload?.items ?? r.payload)?.[0]?.members?.length, 1);
  // Prisma serialises Decimal as a string; the contract coerces it, so compare numerically.
  check(
    'allocation persisted',
    Number((r.payload?.items ?? r.payload)?.[0]?.members?.[0]?.allocationPercentage),
    60,
  );

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members/${projectMemberId}/end`,
    {
      endsOn: '2025-12-01',
    },
    AH,
  );
  check('end before start is rejected', r.status, 409);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members/${projectMemberId}/end`,
    {
      endsOn: '2026-09-30',
    },
    AH,
  );
  check('end project allocation', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/projects`);
  check(
    'allocation row is closed, not removed',
    (r.payload?.items ?? r.payload)?.[0]?.members?.length,
    1,
  );
  check(
    'endsOn persisted',
    String((r.payload?.items ?? r.payload)?.[0]?.members?.[0]?.endsOn ?? '').slice(0, 10),
    '2026-09-30',
  );

  console.log('\nstatutory profiles (drawer compliance section)');
  r = await call(
    A,
    'GET',
    `/v1/organizations/${orgId}/compliance/employees/${employeeId}/profiles`,
  );
  check('GET statutory profiles', r.status, 200);
  check(
    'empty before enrolment',
    Array.isArray(r.payload?.items ?? r.payload)
      ? (r.payload?.items ?? r.payload ?? []).length
      : -1,
    0,
  );
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/compliance/employees/${employeeId}/profiles`,
    {
      schemeCode: 'EPF',
      registrationNumber: '101928374650',
      effectiveFrom: '2024-03-15',
      employeeRate: 12,
      employerRate: 12,
    },
    AH,
  );
  check('POST statutory profile', r.status, 201);
  r = await call(
    A,
    'GET',
    `/v1/organizations/${orgId}/compliance/employees/${employeeId}/profiles`,
  );
  check(
    'UAN comes from registrationNumber',
    (r.payload?.items ?? r.payload)?.[0]?.registrationNumber,
    '101928374650',
  );
  check(
    'employee rate comes from the API',
    Number((r.payload?.items ?? r.payload)?.[0]?.employeeRate),
    12,
  );

  console.log('\ntenant isolation on the new routes');
  const slugB = `empb-${Date.now().toString(36)}`;
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
      adminDisplayName: 'Other Admin',
      reason: 'isolation check',
    },
    PH,
  );
  const orgB = r.payload.organization.id;
  const B = jar();
  r = await call(B, 'POST', '/v1/auth/login', {
    email: `admin@${slugB}.test`,
    password: r.payload.temporaryPassword,
  });
  const BH = { 'x-csrf-token': r.payload?.csrfToken };
  r = await call(B, 'GET', `/v1/organizations/${orgId}/employees/${employeeId}/employment-records`);
  check('tenant B cannot read tenant A employment records', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}/end`,
    {
      leftAt: '2026-08-31',
    },
    BH,
  );
  check('tenant B cannot end tenant A membership', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members/${projectMemberId}/end`,
    {
      endsOn: '2026-08-31',
    },
    BH,
  );
  check('tenant B cannot end tenant A allocation', r.status, 403);
  r = await call(
    B,
    'GET',
    `/v1/organizations/${orgId}/compliance/employees/${employeeId}/profiles`,
  );
  check('tenant B cannot read tenant A statutory profiles', r.status, 403);
  void orgB;
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('aborted:', e.message);
    process.exit(1);
  });
