/**
 * The harness the authorization suites share: a cookie jar, a signed-in employee per call site,
 * and a disposable tenant with two such employees and its administrator.
 *
 * Lifted from `verify-authorization-boundaries.mjs` so a second suite could drive the same real
 * sessions without copying two hundred lines. Every tenant is new, named after the suite and the
 * clock, and lives only in the database the API under test points at.
 */
import { setupCall as setup } from './setup-call.mjs';

const TENANT_TIMEZONE = 'Asia/Kolkata';
export const BASE = process.env.AUTHZ_API_URL ?? 'http://localhost:4000';

let pass = 0;
let fail = 0;
export const ok = (label, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
};

export function jar() {
  const store = new Map();
  return {
    absorb(response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value === '') store.delete(name);
        else store.set(name, value);
      }
    },
    header: () => [...store].map(([k, v]) => k + '=' + v).join('; '),
  };
}

export async function call(cookies, method, path, body, extra) {
  const headers = { Accept: 'application/json', ...(extra ?? {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const cookie = cookies.header();
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  cookies.absorb(response);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, text };
}

export const rows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'records', 'requests', 'timesheets', 'files', 'data'])
    if (Array.isArray(payload[key])) return payload[key];
  return Object.values(payload).find((value) => Array.isArray(value)) ?? [];
};
export const good = (r) => [200, 201, 204].includes(r.status);
/** Refused, rather than merely failing: 403 hides nothing, 404 hides existence. */
export const refused = (r) => r.status === 403 || r.status === 404;
export const iso = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

/**
 * Signs a seeded member in, waiting out the auth rate limit rather than continuing without a
 * session.
 *
 * A failed login used to be silent: `login.payload.csrfToken` became undefined, every later
 * request went out unauthenticated, and the suite reported 401s that said nothing about the
 * boundary under test.
 */
export async function signIn(cookies, email, password) {
  const login = await setup(`sign-in for ${email}`, () =>
    call(cookies, 'POST', '/v1/auth/login', { email, password }),
  );
  if (!login.payload?.csrfToken) throw new Error(`sign-in for ${email} returned no CSRF token`);
  return { 'x-csrf-token': login.payload.csrfToken };
}

/**
 * A tenant with two employees who can each sign in, plus the administrator.
 *
 * `defaultPolicies: false` leaves approval routing to the suite, for cases that need to choose who
 * approves.
 */
export async function tenant(tag, { defaultPolicies = true } = {}) {
  const admin = jar();
  const slug = tag + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const credentials = {
    organizationName: 'AUTHZ ' + slug,
    timezone: TENANT_TIMEZONE,
    currencyCode: 'INR',
    email: 'boss@' + slug + '.test',
    displayName: 'Boss Person',
    password: 'Str0ng-Passw0rd!',
  };
  const response = await setup(`registration of ${slug}`, () =>
    call(admin, 'POST', '/v1/auth/register', credentials),
  );
  const csrf = { 'x-csrf-token': response.payload.csrfToken };
  const me = await setup(`session lookup for ${slug}`, () => call(admin, 'GET', '/v1/auth/me'));
  const orgId = me.payload.organization.id;
  const org = (method, path, body) =>
    call(
      admin,
      method,
      '/v1/organizations/' + orgId + path,
      body,
      method === 'GET' ? undefined : csrf,
    );

  const roles = rows((await setup('role listing', () => org('GET', '/roles'))).payload);
  const branches = rows((await setup('branch listing', () => org('GET', '/branches'))).payload);
  const employeeRole = roles.find((role) => role.code === 'EMPLOYEE');
  // Asserted rather than indexed: a setup call that quietly failed used to surface as
  // "Cannot read properties of undefined", which says nothing about what went wrong.
  if (!branches[0] || !employeeRole)
    throw new Error(`tenant setup incomplete: ${branches.length} branches, ${roles.length} roles`);
  const branchId = branches[0].id;
  const employeeRoleId = employeeRole.id;

  if (defaultPolicies) {
    await org('POST', '/approval-policies', {
      domain: 'TIMESHEET',
      code: 'TS_DEFAULT',
      name: 'Timesheet approval',
      isDefault: true,
      steps: [
        {
          stepNumber: 1,
          approverType: 'ROLE',
          roleId: (roles.find((role) => role.code === 'ORG_ADMIN') ?? roles[0]).id,
          required: true,
        },
      ],
    });
    await org('POST', '/approval-policies', {
      domain: 'ATTENDANCE_CORRECTION',
      code: 'AC_DEFAULT',
      name: 'Attendance correction approval',
      isDefault: true,
      steps: [
        {
          stepNumber: 1,
          approverType: 'ROLE',
          roleId: (roles.find((role) => role.code === 'ORG_ADMIN') ?? roles[0]).id,
          required: true,
        },
      ],
    });
  }

  /** An employee with their own session, so requests carry a real self-service identity. */
  const makeEmployee = async (index, firstName) => {
    const email = 'e' + index + '.' + slug + '@t.test';
    const employee = await setup(`employee ${index}`, () =>
      org('POST', '/employees', {
        employeeNumber: 'EMP-' + index,
        firstName,
        lastName: 'Case',
        workEmail: email,
        employmentType: 'FULL_TIME',
        dateOfJoining: '2026-01-01',
      }),
    );
    const member = await setup(`member ${index}`, () =>
      org('POST', '/members', {
        email,
        displayName: firstName + ' Case',
        roleIds: [employeeRoleId],
        reason: 'authorization boundary regression',
      }),
    );
    await setup(`user link for employee ${index}`, () =>
      org('POST', '/employees/' + employee.payload.id + '/user', {
        userId: member.payload.userId,
      }),
    );
    await setup(`branch posting for employee ${index}`, () =>
      org('POST', '/employees/' + employee.payload.id + '/branches', {
        branchId,
        startsOn: '2026-01-01',
        isPrimary: true,
      }),
    );
    const cookies = jar();
    const employeeCsrf = await signIn(cookies, email, member.payload.temporaryPassword);
    return {
      id: employee.payload.id,
      userId: member.payload.userId,
      as: (method, path, body) =>
        call(
          cookies,
          method,
          '/v1/organizations/' + orgId + path,
          body,
          method === 'GET' ? undefined : employeeCsrf,
        ),
    };
  };

  const a = await makeEmployee('001', 'Ada');
  const b = await makeEmployee('002', 'Bea');
  // The tenant's today, not UTC's. The API files a punch under the tenant's calendar date, so
  // between midnight and 05:30 in Kolkata the UTC date is still yesterday and every "today" check
  // looked in the wrong day.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(new Date());
  return { org, orgId, branchId, roles, a, b, today, monthStart: today.slice(0, 8) + '01' };
}

/** Prints the tally and fails the process when anything failed. */
export function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exitCode = 1;
}
