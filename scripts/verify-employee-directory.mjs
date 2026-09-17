#!/usr/bin/env node
/**
 * Employee directory authorization, against the running API.
 *
 * The unit tests drive a mocked Prisma client, so they prove the branch is taken but not that a
 * real request is actually narrowed. This signs in as a real user holding the seeded EMPLOYEE
 * role and asks the real endpoint for the directory.
 *
 *   pnpm verify:employee-directory
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
      name: `Directory ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Directory Admin',
      reason: 'employee directory verification',
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
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const a = await tenant(P, PH, 'da');
  const b = await tenant(P, PH, 'db');
  check('onboard two tenants', Boolean(a.orgId && b.orgId), true);

  const org = (t, method, path, body) =>
    call(
      t.jar,
      method,
      `/v1/organizations/${t.orgId}${path}`,
      body,
      method === 'GET' ? undefined : t.headers,
    );

  console.log('\ntwo employees in tenant A, created by the administrator');
  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'EMP-001',
    firstName: 'Asha',
    lastName: 'Rao',
    workEmail: `asha@${a.slug}.test`,
    personalEmail: `asha.personal@${a.slug}.test`,
    phone: '+91 90000 00001',
    employmentType: 'FULL_TIME',
  });
  check('create employee A', r.status, [200, 201]);
  const employeeA = r.payload?.id;

  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'EMP-002',
    firstName: 'Bala',
    lastName: 'Subramanian',
    workEmail: `bala@${a.slug}.test`,
    personalEmail: `bala.personal@${a.slug}.test`,
    phone: '+91 90000 00002',
    employmentType: 'FULL_TIME',
  });
  check('create employee B', r.status, [200, 201]);
  const employeeB = r.payload?.id;

  console.log('\nthe administrator still sees the whole directory');
  r = await org(a, 'GET', '/employees');
  check('admin directory returns both', (r.payload?.items ?? []).length, 2);

  console.log('\ngive employee A a login carrying only the EMPLOYEE role');
  r = await org(a, 'GET', '/roles');
  const roles = Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? []);
  const employeeRole = roles.find((role) => role.code === 'EMPLOYEE');
  check('the EMPLOYEE role is seeded', Boolean(employeeRole), true);

  const memberEmail = `asha.user@${a.slug}.test`;
  r = await org(a, 'POST', '/members', {
    email: memberEmail,
    displayName: 'Asha Rao',
    roleIds: [employeeRole?.id],
    reason: 'employee directory verification',
  });
  const invited = r.status === 200 || r.status === 201;
  if (!invited) {
    console.log(`  note  member creation returned ${r.status}: ${JSON.stringify(r.payload)}`);
  }
  check('create an EMPLOYEE-role member', invited, true);
  const memberPassword = r.payload?.temporaryPassword;
  const memberUserId = r.payload?.userId;

  r = await org(a, 'POST', `/employees/${employeeA}/user`, { userId: memberUserId });
  check('link that login to employee A', r.status, [200, 201]);

  const E = jar();
  r = await call(E, 'POST', '/v1/auth/login', { email: memberEmail, password: memberPassword });
  check('the employee can sign in', r.status, [200, 201]);
  const EH = { 'x-csrf-token': r.payload?.csrfToken };
  const asEmployee = (method, path, body) =>
    call(E, method, `/v1/organizations/${a.orgId}${path}`, body, method === 'GET' ? undefined : EH);

  r = await call(E, 'GET', '/v1/auth/me');
  const permissions = r.payload?.permissions ?? [];
  check(
    'their permission set includes employees.read',
    permissions.includes('employees.read'),
    true,
  );
  check(
    'and does NOT include employees.read.all',
    permissions.includes('employees.read.all'),
    false,
  );
  check('nor the wildcard', permissions.includes('*'), false);

  console.log('\nTHE REGRESSION: the directory as an ordinary employee');
  r = await asEmployee('GET', '/employees');
  const visible = r.payload?.items ?? [];
  check('the request still succeeds', r.status, 200);
  check('it returns exactly one record', visible.length, 1);
  check('and that record is their own', visible[0]?.id, employeeA);

  const serialised = JSON.stringify(visible);
  check("employee B's id does not appear", serialised.includes(employeeB), false);
  check(
    "employee B's personal email does not appear",
    serialised.includes(`bala.personal@${a.slug}.test`),
    false,
  );
  check("employee B's phone does not appear", serialised.includes('+91 90000 00002'), false);

  console.log('\nreading a specific employee');
  r = await asEmployee('GET', `/employees/${employeeA}`);
  check('their own record is readable', r.status, 200);
  r = await asEmployee('GET', `/employees/${employeeB}`);
  check("another employee's record is refused", r.status >= 400, true);
  r = await asEmployee('GET', `/employees/${employeeB}/detail`);
  check('so is the detail projection', r.status >= 400, true);
  r = await asEmployee('GET', `/employees/${employeeB}/employment-records`);
  check('so is their employment history', r.status >= 400, true);
  r = await asEmployee('GET', `/employees/${employeeB}/emergency-contacts`);
  check('so are their emergency contacts', r.status >= 400, true);

  console.log('\ntenant isolation is unchanged');
  r = await org(b, 'GET', '/employees');
  check("tenant B's directory is its own and empty", (r.payload?.items ?? []).length, 0);
  r = await call(E, 'GET', `/v1/organizations/${b.orgId}/employees`);
  check("the employee cannot read tenant B's directory", r.status >= 400, true);
  r = await asEmployee('GET', `/employees/${employeeA}`.replace(employeeA, b.orgId));
  check('a foreign id reports as missing rather than refused', r.status, [403, 404]);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
