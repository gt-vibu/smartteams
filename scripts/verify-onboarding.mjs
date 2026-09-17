#!/usr/bin/env node
/**
 * Employee onboarding, end to end against the running API.
 *
 * Walks the exact sequence the Add employee dialog performs — create employee, employment record,
 * manager, login, link — and then re-reads everything to prove it persisted rather than merely
 * returning 201. The security half checks that the flow cannot be driven by someone who should
 * not be able to, and that cross-tenant values are refused by the server rather than by the form.
 *
 *   pnpm verify:onboarding
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

async function tenant(P, PH, prefix) {
  const slug = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Onboarding ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Onboarding Admin',
      reason: 'onboarding verification',
    },
    PH,
  );
  const A = jar();
  const login = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  return {
    slug,
    orgId: r.payload.organization.id,
    jar: A,
    headers: { 'x-csrf-token': login.payload.csrfToken },
  };
}

async function main() {
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const a = await tenant(P, PH, 'oa');
  const b = await tenant(P, PH, 'ob');

  const org = (t, method, path, body) =>
    call(
      t.jar,
      method,
      `/v1/organizations/${t.orgId}${path}`,
      body,
      method === 'GET' ? undefined : t.headers,
    );

  console.log('\nwhat the dialog needs before it can be filled in');
  r = await org(a, 'GET', '/branches');
  check('branches are readable', r.status, 200);
  const branchId = (r.payload ?? [])[0]?.id;
  check('the tenant has a branch to choose', Boolean(branchId), true);

  r = await org(a, 'GET', '/roles');
  const roles = Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? []);
  const employeeRole = roles.find((role) => role.code === 'EMPLOYEE');
  check('the EMPLOYEE role is available to assign', Boolean(employeeRole), true);

  console.log('\nstep 1 — the manager, onboarded the same way');
  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'MGR-001',
    firstName: 'Kavita',
    lastName: 'Joshi',
    workEmail: `kavita@${a.slug}.test`,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2024-01-15',
    primaryBranchId: branchId,
  });
  check('create the manager', r.status, [200, 201]);
  const managerId = r.payload?.id;

  console.log('\nstep 2 — the new joiner');
  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'EMP-100',
    firstName: 'Nikhil',
    lastName: 'Menon',
    workEmail: `nikhil@${a.slug}.test`,
    personalEmail: `nikhil.personal@${a.slug}.test`,
    phone: '+91 90000 12345',
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-08-03',
    primaryBranchId: branchId,
  });
  check('create the employee', r.status, [200, 201]);
  const employeeId = r.payload?.id;

  r = await org(a, 'POST', `/employees/${employeeId}/employment-records`, {
    jobTitle: 'Backend Engineer',
    department: 'Engineering',
    managerEmployeeId: managerId,
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    effectiveFrom: '2026-08-03',
  });
  check('record job title, department and reporting line', r.status, [200, 201]);

  r = await org(a, 'PUT', `/employees/${employeeId}/manager`, { managerEmployeeId: managerId });
  check('set the live manager pointer approvals resolve against', r.status, [200, 201]);

  console.log('\nstep 3 — the login, least privilege');
  r = await org(a, 'POST', '/members', {
    email: `nikhil@${a.slug}.test`,
    displayName: 'Nikhil Menon',
    roleIds: [employeeRole?.id],
    reason: 'Onboarding Nikhil Menon',
  });
  check('create the login', r.status, [200, 201]);
  const userId = r.payload?.userId;
  const password = r.payload?.temporaryPassword;
  check('a temporary password is returned once', typeof password, 'string');

  r = await org(a, 'POST', `/employees/${employeeId}/user`, { userId });
  check('link the login to the employee record', r.status, [200, 201]);

  console.log('\nit persisted — re-read, not the create response');
  r = await org(a, 'GET', `/employees/${employeeId}/detail`);
  check('the detail route returns the employee', r.status, 200);
  check('joining date persisted', String(r.payload?.dateOfJoining).slice(0, 10), '2026-08-03');
  check('job title persisted', r.payload?.jobTitle, 'Backend Engineer');
  check('department persisted', r.payload?.department, 'Engineering');
  check('manager persisted', r.payload?.managerEmployeeId, managerId);
  check('the account shows as attached', r.payload?.hasUserAccount, true);
  check('the user id itself is not exposed', 'userId' in (r.payload ?? {}), false);

  r = await org(a, 'GET', `/employees/${managerId}/detail`);
  check('the manager now has a direct report', (r.payload?.directReports ?? []).length, 1);

  r = await org(a, 'GET', '/employees');
  check('the employee appears in the directory', (r.payload?.items ?? []).length, 2);

  console.log('\nthe directory projection the Organization workspace reads');
  r = await org(a, 'GET', '/employees/directory');
  const directory = r.payload?.items ?? [];
  check('the directory route answers', r.status, 200);
  check('it returns both employees', directory.length, 2);
  const joiner = directory.find((entry) => entry.id === employeeId);
  check('with the reporting line the shared DTO omits', joiner?.managerEmployeeId, managerId);
  check('and the job title', joiner?.jobTitle, 'Backend Engineer');
  check('and the department', joiner?.department, 'Engineering');
  check('and the joining date as a plain date', joiner?.dateOfJoining, '2026-08-03');
  check('account state without the user id', joiner?.hasUserAccount, true);
  check('the user id is never exposed', 'userId' in (joiner ?? {}), false);

  r = await org(b, 'GET', '/employees/directory');
  // Tenant B has no employees at this point in the run; the assertion is that it sees
  // its own emptiness rather than tenant A's two people.
  check("another tenant's directory is its own and empty", (r.payload?.items ?? []).length, 0);

  console.log('\nthe new joiner is least-privileged, not an administrator');
  const N = jar();
  r = await call(N, 'POST', '/v1/auth/login', { email: `nikhil@${a.slug}.test`, password });
  check('the new joiner can sign in', r.status, [200, 201]);
  const newJoinerCsrf = r.payload?.csrfToken;
  r = await call(N, 'GET', '/v1/auth/me');
  const permissions = r.payload?.permissions ?? [];
  check('no wildcard was granted', permissions.includes('*'), false);
  check('no organization-wide employee read', permissions.includes('employees.read.all'), false);
  check('no employee write', permissions.includes('employees.write'), false);
  check('their own attendance is reachable', permissions.includes('attendance.read'), true);
  check(
    'the session resolves to their employee record',
    r.payload?.employee?.id ?? r.payload?.employeeId,
    employeeId,
  );

  console.log('\nauthorization is server-side, not a hidden button');
  // The CSRF token was issued at sign-in; without it these would be refused for the wrong
  // reason and the authorization assertion would prove nothing.
  const NH = { 'x-csrf-token': newJoinerCsrf };
  r = await call(
    N,
    'POST',
    `/v1/organizations/${a.orgId}/employees`,
    {
      employeeNumber: 'EMP-999',
      firstName: 'Not',
      lastName: 'Allowed',
      employmentType: 'FULL_TIME',
    },
    NH,
  );
  check('an ordinary employee cannot create an employee', r.status >= 400, true);
  r = await call(
    N,
    'POST',
    `/v1/organizations/${a.orgId}/members`,
    { email: 'x@y.test', displayName: 'X', roleIds: [employeeRole?.id], reason: 'attempt' },
    NH,
  );
  check('nor create a login', r.status >= 400, true);

  console.log('\ncross-tenant values are refused by the server');
  r = await org(b, 'POST', '/employees', {
    employeeNumber: 'B-001',
    firstName: 'Other',
    lastName: 'Tenant',
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-01-01',
  });
  const foreignEmployeeId = r.payload?.id;

  r = await org(a, 'PUT', `/employees/${employeeId}/manager`, {
    managerEmployeeId: foreignEmployeeId,
  });
  check('a manager from another tenant is refused', r.status >= 400, true);
  r = await org(a, 'PUT', `/employees/${employeeId}/manager`, { managerEmployeeId: employeeId });
  check('an employee cannot manage themselves', r.status >= 400, true);
  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'EMP-100',
    firstName: 'Duplicate',
    lastName: 'Number',
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-08-03',
  });
  check('a duplicate employee number is refused as a conflict, not a 500', r.status, [400, 409]);

  r = await org(a, 'POST', '/members', {
    email: `nikhil@${a.slug}.test`,
    displayName: 'Nikhil Menon',
    roleIds: [employeeRole?.id],
    reason: 'duplicate attempt',
  });
  check('adding the same person twice is refused', r.status, [400, 409]);

  r = await org(a, 'POST', `/employees/${managerId}/user`, { userId });
  check('one login cannot be linked to two employees', r.status >= 400, true);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
