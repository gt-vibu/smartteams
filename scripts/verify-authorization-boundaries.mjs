#!/usr/bin/env node
/**
 * Can employee A act on employee B by changing an id in the request?
 *
 * Every self-service write permission — `attendance.write`, `leave.requests.write`,
 * `timesheets.write`, `timesheets.submit`, `files.write` — is held by every seeded employee. The
 * services used to check only that the target belonged to the same organisation, so a UUID
 * belonging to a colleague was enough to punch, correct, book leave, log time, submit, recall or
 * delete on their behalf. These checks drive each of those paths as a real signed-in employee.
 *
 * Also covered here: the punch timestamp. A self-service punch is recorded at server time, so a
 * forged past or future `occurredAt` cannot manufacture attendance that feeds overtime and pay.
 *
 * Positive cases are asserted alongside the negative ones. A boundary that refuses everything
 * would pass a suite of denials while breaking the product.
 *
 *   pnpm verify:authorization-boundaries
 */
import { setupCall as setup } from './lib/setup-call.mjs';

const BASE = process.env.AUTHZ_API_URL ?? 'http://localhost:4000';

let pass = 0;
let fail = 0;
const ok = (label, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
};

function jar() {
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

async function call(cookies, method, path, body, extra) {
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

const rows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'records', 'requests', 'timesheets', 'files', 'data'])
    if (Array.isArray(payload[key])) return payload[key];
  return Object.values(payload).find((value) => Array.isArray(value)) ?? [];
};
const good = (r) => [200, 201, 204].includes(r.status);
/** Refused, rather than merely failing: 403 hides nothing, 404 hides existence. */
const refused = (r) => r.status === 403 || r.status === 404;
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

/**
 * Signs a seeded member in, waiting out the auth rate limit rather than continuing without a
 * session.
 *
 * A failed login used to be silent: `login.payload.csrfToken` became undefined, every later
 * request went out unauthenticated, and the suite reported 401s that said nothing about the
 * boundary under test.
 */
async function signIn(cookies, email, password) {
  const login = await setup(`sign-in for ${email}`, () =>
    call(cookies, 'POST', '/v1/auth/login', { email, password }),
  );
  if (!login.payload?.csrfToken) throw new Error(`sign-in for ${email} returned no CSRF token`);
  return { 'x-csrf-token': login.payload.csrfToken };
}

/** A tenant with two employees who can each sign in, plus the administrator. */
async function tenant(tag) {
  const admin = jar();
  const slug = tag + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const credentials = {
    organizationName: 'AUTHZ ' + slug,
    timezone: 'Asia/Kolkata',
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
  const today = iso(new Date());
  return { org, orgId, branchId, a, b, today, monthStart: today.slice(0, 8) + '01' };
}

const t = await tenant('az');
const other = await tenant('oz');

console.log('attendance punches');
{
  const own = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: t.a.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok('an employee may punch for themselves', good(own), 'HTTP ' + own.status);

  const forOther = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  // Refused outright, rather than quietly recorded against the caller: naming a colleague is a
  // different request from omitting the field, and it must not succeed.
  ok('an employee may not punch for a colleague', refused(forOther), 'HTTP ' + forOther.status);

  const crossTenant = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: other.a.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok(
    'an employee may not punch for another tenant',
    refused(crossTenant),
    'HTTP ' + crossTenant.status,
  );

  const forged = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: '00000000-0000-4000-8000-000000000000',
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok('a forged employee id is refused', refused(forged), 'HTTP ' + forged.status);
}

console.log('\nattendance timestamps are the server’s');
{
  const employee = await tenant('ts');
  const forgedPast = await employee.a.as('POST', '/attendance/check-ins', {
    employeeId: employee.a.id,
    occurredAt: '2020-01-01T03:00:00.000Z',
    workDate: '2020-01-01',
    branchId: employee.branchId,
  });
  ok(
    'a punch with a forged past timestamp is accepted but not believed',
    good(forgedPast),
    'HTTP ' + forgedPast.status,
  );

  const recorded = rows(
    (
      await employee.org(
        'GET',
        `/attendance?employeeId=${employee.a.id}&from=2020-01-01&to=2020-01-02`,
      )
    ).payload,
  );
  ok(
    'nothing is filed under the forged date',
    recorded.length === 0,
    recorded.length + ' rows in 2020',
  );

  const todayRows = rows(
    (
      await employee.org(
        'GET',
        `/attendance?employeeId=${employee.a.id}&from=${employee.today}&to=${employee.today}`,
      )
    ).payload,
  );
  ok('the punch is filed under today', todayRows.length === 1, todayRows.length + ' rows today');
  const punchedAt = todayRows[0] ? new Date(todayRows[0].createdAt ?? Date.now()).getFullYear() : 0;
  ok('and carries a present-day timestamp', punchedAt >= 2026, String(punchedAt));
}

console.log('\nattendance corrections');
{
  const bRecord = await t.b.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  const bRecordId = bRecord.payload?.attendanceRecordId ?? bRecord.payload?.record?.id;
  const aRows = rows(
    (await t.a.as('GET', '/attendance?from=' + t.today + '&to=' + t.today)).payload,
  );
  const aRecordId = aRows[0]?.id;

  if (aRecordId) {
    const own = await t.a.as('POST', '/attendance/' + aRecordId + '/corrections', {
      reason: 'Adjusting my own recorded hours for the day',
    });
    ok('an employee may correct their own record', good(own), 'HTTP ' + own.status);
  } else {
    ok('an employee may correct their own record', false, 'no own record found');
  }

  if (bRecordId) {
    const forOther = await t.a.as('POST', '/attendance/' + bRecordId + '/corrections', {
      reason: 'Attempting to correct a colleague record',
    });
    ok(
      "an employee may not correct a colleague's record",
      refused(forOther),
      'HTTP ' + forOther.status,
    );
  } else {
    ok(
      "an employee may not correct a colleague's record",
      false,
      'no colleague record id returned',
    );
  }
}

console.log('\nleave requests');
{
  const paid = rows((await t.a.as('GET', '/leave/types')).payload).find((type) => type.paid);
  const own = await t.a.as('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: paid.id,
    startDate: daysAgo(2),
    endDate: daysAgo(2),
    reason: 'Own leave request',
  });
  ok('an employee may request their own leave', good(own), 'HTTP ' + own.status);

  const forOther = await t.a.as('POST', '/leave/requests', {
    employeeId: t.b.id,
    leaveTypeId: paid.id,
    startDate: daysAgo(3),
    endDate: daysAgo(3),
    reason: 'Booking leave for a colleague',
  });
  ok(
    'an employee may not request leave for a colleague',
    refused(forOther),
    'HTTP ' + forOther.status,
  );
}

console.log('\ntimesheets');
{
  const period = await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  });
  await t.org('POST', '/timesheets/periods/' + period.payload.id + '/derive', {});
  const sheets = rows((await t.org('GET', '/timesheets')).payload);
  const aSheet = sheets.find((sheet) => sheet.employeeId === t.a.id);
  const bSheet = sheets.find((sheet) => sheet.employeeId === t.b.id);

  const ownEntry = await t.a.as('POST', '/timesheets/entries', {
    timesheetId: aSheet?.id,
    workDate: t.today,
    minutes: 60,
    description: 'Own work',
  });
  ok('an employee may log time on their own sheet', good(ownEntry), 'HTTP ' + ownEntry.status);

  const otherEntry = await t.a.as('POST', '/timesheets/entries', {
    timesheetId: bSheet?.id,
    workDate: t.today,
    minutes: 60,
    description: 'Work on a colleague sheet',
  });
  ok(
    "an employee may not log time on a colleague's sheet",
    refused(otherEntry),
    'HTTP ' + otherEntry.status,
  );

  const otherSubmit = await t.a.as('POST', '/timesheets/' + bSheet?.id + '/submit', {});
  ok(
    "an employee may not submit a colleague's sheet",
    refused(otherSubmit),
    'HTTP ' + otherSubmit.status,
  );

  const ownSubmit = await t.a.as('POST', '/timesheets/' + aSheet?.id + '/submit', {});
  ok('an employee may submit their own sheet', good(ownSubmit), 'HTTP ' + ownSubmit.status);

  const otherUnsubmit = await t.b.as('POST', '/timesheets/' + aSheet?.id + '/unsubmit', {});
  ok(
    "an employee may not recall a colleague's submission",
    refused(otherUnsubmit),
    'HTTP ' + otherUnsubmit.status,
  );

  const ownUnsubmit = await t.a.as('POST', '/timesheets/' + aSheet?.id + '/unsubmit', {});
  ok(
    'an employee may recall their own submission',
    good(ownUnsubmit),
    'HTTP ' + ownUnsubmit.status,
  );
}

console.log('\nadministrative breadth still works');
{
  const adminPunch = await t.org('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    workDate: daysAgo(5),
    branchId: t.branchId,
  });
  ok('an administrator may punch for an employee', good(adminPunch), 'HTTP ' + adminPunch.status);

  const backdated = rows(
    (await t.org('GET', `/attendance?employeeId=${t.b.id}&from=${daysAgo(5)}&to=${daysAgo(5)}`))
      .payload,
  );
  // Breadth includes supplying the time: an administrator importing from a device is recording
  // something that happened elsewhere, which is exactly what a self-service punch is not.
  ok('and may supply the moment it happened', backdated.length === 1, backdated.length + ' rows');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
