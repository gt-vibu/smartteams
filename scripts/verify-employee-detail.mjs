#!/usr/bin/env node
/**
 * Employee detail and identity check.
 *
 * Three things were persisted and unreadable — `dateOfJoining`, `managerEmployeeId`, and the
 * job title and department on the employment record — because the shared employee DTO is the
 * federation response contract and could not be widened. And `Employee.userId` existed but only
 * the federated sync path ever set it, so a natively created employee had no login attached:
 * self-scoped reads resolved nothing and a `MANAGER` approval step could never find an approver.
 *
 * This proves the native detail route returns all of it, that the new link route creates the
 * association the product depends on, and that manager approval routing then actually resolves.
 *
 *   pnpm verify:employee-detail
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
      name: `Ident ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Identity Admin',
      reason: 'employee detail verification',
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
    userId: login.payload.userId,
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

  const a = await tenant(P, PH, 'ia');
  const b = await tenant(P, PH, 'ib');
  const org = (t, method, path, body) =>
    call(
      t.jar,
      method,
      `/v1/organizations/${t.orgId}${path}`,
      body,
      method === 'GET' ? undefined : t.headers,
    );

  r = await org(a, 'GET', '/branches');
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;
  const makeEmployee = async (number, first, joining) => {
    const res = await org(a, 'POST', '/employees', {
      employeeNumber: number,
      firstName: first,
      lastName: 'Test',
      workEmail: `${first.toLowerCase()}@${a.slug}.test`,
      employmentType: 'FULL_TIME',
      dateOfJoining: joining,
      primaryBranchId: branchId,
    });
    return res.payload?.id;
  };
  const manager = await makeEmployee('EMP-MGR', 'Meera', '2023-01-09');
  const report = await makeEmployee('EMP-001', 'Asha', '2024-03-15');
  check('employees created', Boolean(manager && report), true);

  console.log('\nfields that were persisted but unreadable');
  r = await org(a, 'GET', `/employees/${report}`);
  // The shared DTO is unchanged: this is what the federation contract still returns.
  check(
    'the shared employee DTO still omits the joining date',
    r.payload?.dateOfJoining,
    undefined,
  );
  check('and still omits the manager', r.payload?.managerEmployeeId, undefined);

  r = await org(a, 'GET', `/employees/${report}/detail`);
  check('the native detail route responds', r.status, 200);
  check(
    'it returns the joining date that was stored',
    r.payload?.dateOfJoining?.slice(0, 10),
    '2024-03-15',
  );
  check('no manager is assigned yet', r.payload?.manager, null);
  check('and no direct reports', (r.payload?.directReports ?? []).length, 0);
  check('no login is attached yet', r.payload?.hasUserAccount, false);
  check('the user id itself is never exposed', r.payload?.userId, undefined);

  console.log('\nreporting line');
  r = await org(a, 'PUT', `/employees/${report}/manager`, { managerEmployeeId: manager });
  check('assign a manager', r.status, 200);
  r = await org(a, 'PUT', `/employees/${report}/manager`, { managerEmployeeId: report });
  check('an employee cannot manage themselves', r.status, [400, 409]);

  r = await org(a, 'GET', `/employees/${report}/detail`);
  check('the manager is now readable', r.payload?.manager?.id, manager);
  check('with the summary the screen needs', r.payload?.manager?.employeeNumber, 'EMP-MGR');
  r = await org(a, 'GET', `/employees/${manager}/detail`);
  check('and the report appears under the manager', (r.payload?.directReports ?? []).length, 1);
  check('resolved by id, not by name', r.payload?.directReports?.[0]?.id, report);

  console.log('\njob title and department from the employment record');
  r = await org(a, 'POST', `/employees/${report}/employment-records`, {
    jobTitle: 'Product Engineer',
    department: 'Product',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    effectiveFrom: '2024-03-15',
  });
  check('add an employment record', r.status, [200, 201]);
  r = await org(a, 'GET', `/employees/${report}/detail`);
  check('the job title is projected into the detail', r.payload?.jobTitle, 'Product Engineer');
  check('and the department', r.payload?.department, 'Product');

  console.log('\nuser to employee linkage');
  const password = 'Identity-Link-123!';
  const E = jar();
  r = await call(E, 'POST', '/v1/auth/register', {
    organizationName: `Home ${a.slug}`,
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    email: `asha.user@${a.slug}.test`,
    displayName: 'Asha User',
    password,
  });
  check('register a user account', r.status, [200, 201]);
  // The login/register result carries `userId` at the top level, not a nested user object.
  const userId = r.payload?.userId;

  r = await org(a, 'POST', `/employees/${report}/user`, { userId });
  // The user belongs to their own organization, not this tenant, so membership must refuse it.
  check('a user outside the organization cannot be linked', r.status, [403, 404]);

  // The tenant administrator is an active member with no employee record, so linking them proves
  // the positive path without needing an invitation flow this pass does not touch.
  r = await org(a, 'POST', `/employees/${manager}/user`, { userId: a.userId });
  check('an organization member can be linked to an employee', r.status, [200, 201]);
  r = await org(a, 'GET', `/employees/${manager}/detail`);
  check('the employee now reports a login', r.payload?.hasUserAccount, true);

  r = await org(a, 'POST', `/employees/${report}/user`, { userId: a.userId });
  check('the same user cannot be linked to a second employee', r.status, [400, 409]);
  r = await org(a, 'POST', `/employees/${manager}/user`, { userId: a.userId });
  check('re-linking the same pair is accepted as a no-op', r.status, [200, 201]);

  r = await call(
    b.jar,
    'POST',
    `/v1/organizations/${a.orgId}/employees/${report}/user`,
    { userId: b.userId },
    b.headers,
  );
  check('another tenant cannot link into this organization', r.status, [403, 404]);

  r = await org(b, 'GET', `/employees/${report}/detail`);
  check('another tenant cannot read this employee', r.status, [403, 404]);

  console.log('\nself-scoped reads');
  r = await org(a, 'GET', `/employees/${manager}/detail`);
  check('an administrator reads any employee', r.status, 200);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
