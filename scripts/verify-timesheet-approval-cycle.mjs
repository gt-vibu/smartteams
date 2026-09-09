#!/usr/bin/env node
/**
 * Timesheet approval-cycle regression.
 *
 * `derive` rebuilds a period's attendance entries and returns its sheets to draft. That is a new
 * approval cycle: the decisions that came before were about entries that no longer exist. But
 * `TimesheetApproval` holds one row per approver per sheet — `@@unique([timesheetId,
 * approverUserId])` leaves no room for a second round — so unless the reset clears them, the
 * original approver collides with their own previous row and can never approve the rebuilt sheet.
 * The period then sticks at SUBMITTED, and because payroll consumes approved timesheets only, it
 * can never be recalculated for that period.
 *
 * These checks drive the cycle repeatedly, through both a single-step and a two-step policy, and
 * assert against the database that no approval rows accumulate.
 *
 *   pnpm verify:timesheet-approval-cycle
 */
import { createRequire } from 'node:module';
import { resolveDatabaseUrl } from './lib/database-url.mjs';

const BASE = 'http://localhost:4000';
// `pg` is a dependency of the API workspace, not of the repo root, so resolve it from there.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const DB = resolveDatabaseUrl();

let pass = 0;
let fail = 0;
const ok = (label, condition, detailText = '') => {
  if (condition) {
    pass += 1;
    console.log('  ok    ' + label + (detailText ? '  (' + detailText + ')' : ''));
  } else {
    fail += 1;
    console.log('  FAIL  ' + label + '  ' + detailText);
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
  for (const key of ['items', 'timesheets', 'runs', 'records', 'data'])
    if (Array.isArray(payload[key])) return payload[key];
  return Object.values(payload).find((value) => Array.isArray(value)) ?? [];
};
const good = (response) => [200, 201, 204].includes(response.status);
const detail = (response) => {
  try {
    return JSON.parse(response.text).detail;
  } catch {
    return String(response.status);
  }
};
const iso = (date) => date.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

const db = new Client({ connectionString: DB });
await db.connect();
const approvalRows = async (organizationId) =>
  Number(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM timesheet_approvals WHERE organization_id = $1',
        [organizationId],
      )
    ).rows[0].n,
  );

async function tenant(tag) {
  const cookies = jar();
  const slug = tag + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const credentials = {
    organizationName: 'TA ' + slug,
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    email: 'boss@' + slug + '.test',
    displayName: 'Boss Person',
    password: 'Str0ng-Passw0rd!',
  };
  let response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  // Enough tenants in one run will reach the auth rate limit; that is the limiter working, not the
  // thing under test, so wait for the window rather than reporting a false negative.
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  }
  if (!good(response))
    throw new Error('registration failed: HTTP ' + response.status + ' ' + detail(response));

  const csrf = { 'x-csrf-token': response.payload.csrfToken };
  const me = (await call(cookies, 'GET', '/v1/auth/me')).payload;
  const orgId = me.organization.id;
  const adminUserId = me.user.id;
  const org = (method, path, body) =>
    call(
      cookies,
      method,
      '/v1/organizations/' + orgId + path,
      body,
      method === 'GET' ? undefined : csrf,
    );

  const roles = rows((await org('GET', '/roles')).payload);
  const branchId = rows((await org('GET', '/branches')).payload)[0].id;

  // Timesheet submission now requires a configured approval policy, the same rule leave and
  // attendance corrections already enforce. A tenant configures one; these suites do the same.
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

  const email = 'e.' + slug + '@t.test';
  let created = await org('POST', '/employees', {
    employeeNumber: 'EMP-1',
    firstName: 'Sam',
    lastName: 'Cycle',
    workEmail: email,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-01-01',
  });
  const employeeId = created.payload.id;
  created = await org('POST', '/members', {
    email,
    displayName: 'Sam Cycle',
    roleIds: [roles.find((role) => role.code === 'EMPLOYEE').id],
    reason: 'approval cycle regression',
  });
  await org('POST', '/employees/' + employeeId + '/user', { userId: created.payload.userId });
  await org('POST', '/employees/' + employeeId + '/branches', {
    branchId,
    startsOn: '2026-01-01',
    isPrimary: true,
  });

  const today = iso(new Date());
  const monthStart = today.slice(0, 8) + '01';
  // A closed punch pair, not just a check-in: worked minutes only accrue when an OUT closes an
  // IN, and a timesheet derived from an open punch has nothing in it to submit.
  await org('POST', '/attendance/check-ins', {
    employeeId,
    occurredAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    workDate: daysAgo(3),
    branchId,
  });
  await org('POST', '/attendance/check-outs', {
    employeeId,
    occurredAt: new Date(Date.now() - 3 * 86400000 + 8 * 3600000).toISOString(),
    workDate: daysAgo(3),
    branchId,
  });
  return { org, orgId, adminUserId, employeeId, branchId, today, monthStart, slug, roles };
}

async function derivedPeriod(t) {
  const period = await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  });
  await t.org('POST', '/timesheets/periods/' + period.payload.id + '/derive', {});
  return period.payload.id;
}

const sheets = async (t) => rows((await t.org('GET', '/timesheets')).payload);

async function submitAndApprove(t, comment) {
  for (const sheet of await sheets(t))
    if (sheet.status === 'DRAFT') await t.org('POST', '/timesheets/' + sheet.id + '/submit', {});
  const results = [];
  for (const sheet of await sheets(t))
    results.push(
      await t.org('POST', '/timesheets/' + sheet.id + '/decision', { status: 'APPROVED', comment }),
    );
  return results;
}

/**
 * An approver for a USER-type policy step. `canApprove` requires the approver to be an active
 * employee linked to that user, not merely an administrator, so each one needs a full employee
 * record and a session of their own.
 */
async function addApprover(t, tag, label) {
  const email = tag + '.' + t.slug + '@t.test';
  const adminRole = t.roles.find((role) => role.code === 'ORG_ADMIN') ?? t.roles[0];
  const employee = await t.org('POST', '/employees', {
    employeeNumber: 'EMP-' + tag,
    firstName: label,
    lastName: 'Approver',
    workEmail: email,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-01-01',
  });
  const member = await t.org('POST', '/members', {
    email,
    displayName: label + ' Approver',
    roleIds: [adminRole.id],
    reason: 'approver for the regression',
  });
  await t.org('POST', '/employees/' + employee.payload.id + '/user', {
    userId: member.payload.userId,
  });
  await t.org('POST', '/employees/' + employee.payload.id + '/branches', {
    branchId: t.branchId,
    startsOn: '2026-01-01',
    isPrimary: true,
  });
  const cookies = jar();
  const login = await call(cookies, 'POST', '/v1/auth/login', {
    email,
    password: member.payload.temporaryPassword,
  });
  const csrf = { 'x-csrf-token': login.payload.csrfToken };
  return {
    userId: member.payload.userId,
    employeeId: employee.payload.id,
    org: (method, path, body) =>
      call(
        cookies,
        method,
        '/v1/organizations/' + t.orgId + path,
        body,
        method === 'GET' ? undefined : csrf,
      ),
  };
}

console.log('single-step policy: the same approver across repeated cycles');
{
  const t = await tenant('tac');
  const periodId = await derivedPeriod(t);
  let completed = 0;
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const decisions = await submitAndApprove(
      t,
      'cycle ' + cycle + ' approval by the same approver',
    );
    const statuses = (await sheets(t)).map((sheet) => sheet.status);
    const approved = decisions.length > 0 && decisions.every(good);
    ok(
      'cycle ' + cycle + ': the same approver approves the derived sheet',
      approved && statuses.every((status) => status === 'APPROVED'),
      'HTTP ' + decisions.map((d) => d.status).join(',') + ' -> ' + JSON.stringify(statuses),
    );
    if (approved) completed += 1;
    // One row per sheet per cycle: the previous cycle's row must not survive.
    const count = await approvalRows(t.orgId);
    const sheetCount = (await sheets(t)).length;
    ok(
      'cycle ' + cycle + ': exactly one approval row per sheet',
      count === sheetCount,
      count + ' rows for ' + sheetCount + ' sheets',
    );
    if (cycle < 3) await t.org('POST', '/timesheets/periods/' + periodId + '/derive', {});
  }
  ok('all three cycles completed', completed === 3, completed + '/3');

  console.log('');
  console.log('rejected -> re-derive -> re-submit');
  await t.org('POST', '/timesheets/periods/' + periodId + '/derive', {});
  for (const sheet of await sheets(t))
    await t.org('POST', '/timesheets/' + sheet.id + '/submit', {});
  const rejections = [];
  for (const sheet of await sheets(t))
    rejections.push(
      await t.org('POST', '/timesheets/' + sheet.id + '/decision', {
        status: 'REJECTED',
        comment: 'rejected for the regression',
      }),
    );
  ok(
    'the sheet can be rejected',
    rejections.every(good) && (await sheets(t)).every((sheet) => sheet.status === 'REJECTED'),
    JSON.stringify((await sheets(t)).map((sheet) => sheet.status)),
  );

  await t.org('POST', '/timesheets/periods/' + periodId + '/derive', {});
  ok(
    're-derive after a rejection returns the sheet to draft',
    (await sheets(t)).every((sheet) => sheet.status === 'DRAFT'),
    JSON.stringify((await sheets(t)).map((sheet) => sheet.status)),
  );

  const afterRejection = await submitAndApprove(t, 'approved after the earlier rejection');
  ok(
    'the same approver who rejected can approve the rebuilt sheet',
    afterRejection.every(good) && (await sheets(t)).every((sheet) => sheet.status === 'APPROVED'),
    'HTTP ' +
      afterRejection.map((d) => d.status).join(',') +
      ' -> ' +
      JSON.stringify((await sheets(t)).map((sheet) => sheet.status)),
  );
  const finalCount = await approvalRows(t.orgId);
  const finalSheets = (await sheets(t)).length;
  ok(
    'no approval rows accumulated across every cycle',
    finalCount === finalSheets,
    finalCount + ' rows for ' + finalSheets + ' sheets',
  );
}

console.log('');
console.log('two-step policy: both approvers, across a re-derive');
{
  const t = await tenant('tac2');
  // Two distinct approvers, so a two-step chain is not blocked by one person holding both steps.
  const first = await addApprover(t, 'A1', 'First');
  const second = await addApprover(t, 'A2', 'Second');

  const policy = await t.org('POST', '/approval-policies', {
    domain: 'TIMESHEET',
    code: 'TS-2STEP',
    name: 'Two step timesheet',
    isDefault: true,
    steps: [
      { stepNumber: 1, approverType: 'USER', approverUserId: first.userId, required: true },
      { stepNumber: 2, approverType: 'USER', approverUserId: second.userId, required: true },
    ],
  });
  ok(
    'a two-step timesheet policy is created',
    good(policy),
    'HTTP ' + policy.status + ' ' + (good(policy) ? '' : detail(policy)),
  );

  const periodId = await derivedPeriod(t);
  const runCycle = async (label) => {
    for (const sheet of await sheets(t))
      if (sheet.status === 'DRAFT') await t.org('POST', '/timesheets/' + sheet.id + '/submit', {});
    const sheet = (await sheets(t)).find((row) => row.employeeId === t.employeeId);
    const stepOne = await first.org('POST', '/timesheets/' + sheet.id + '/decision', {
      status: 'APPROVED',
      comment: label + ' step one',
    });
    const midway = (await sheets(t)).find((row) => row.id === sheet.id).status;
    ok(
      label + ': step one leaves the sheet awaiting step two',
      good(stepOne) && midway === 'SUBMITTED',
      'HTTP ' + stepOne.status + ' ' + (good(stepOne) ? '' : detail(stepOne)) + ' -> ' + midway,
    );
    const stepTwo = await second.org('POST', '/timesheets/' + sheet.id + '/decision', {
      status: 'APPROVED',
      comment: label + ' step two',
    });
    const end = (await sheets(t)).find((row) => row.id === sheet.id).status;
    ok(
      label + ': step two completes the approval',
      good(stepTwo) && end === 'APPROVED',
      'HTTP ' + stepTwo.status + ' ' + (good(stepTwo) ? '' : detail(stepTwo)) + ' -> ' + end,
    );
  };

  await runCycle('first cycle');
  ok(
    'two approval rows after a two-step cycle',
    (await approvalRows(t.orgId)) === 2,
    (await approvalRows(t.orgId)) + ' rows',
  );
  await t.org('POST', '/timesheets/periods/' + periodId + '/derive', {});
  ok(
    're-derive clears both steps',
    (await approvalRows(t.orgId)) === 0,
    (await approvalRows(t.orgId)) + ' rows',
  );
  await runCycle('second cycle');
  ok(
    'still exactly two approval rows after the second cycle',
    (await approvalRows(t.orgId)) === 2,
    (await approvalRows(t.orgId)) + ' rows',
  );
}

console.log('');
console.log('tenant isolation');
{
  const a = await tenant('tisoa');
  const b = await tenant('tisob');
  const periodA = await derivedPeriod(a);
  await derivedPeriod(b);
  await submitAndApprove(b, 'tenant B approval that must survive');
  const bBefore = await approvalRows(b.orgId);
  ok('tenant B has its own approval rows', bBefore > 0, bBefore + ' rows');

  await submitAndApprove(a, 'tenant A approval');
  await a.org('POST', '/timesheets/periods/' + periodA + '/derive', {});
  ok(
    "tenant A's re-derive clears only tenant A",
    (await approvalRows(a.orgId)) === 0,
    (await approvalRows(a.orgId)) + ' rows in A',
  );
  ok(
    "tenant B's approval rows are untouched",
    (await approvalRows(b.orgId)) === bBefore,
    (await approvalRows(b.orgId)) + ' rows in B',
  );
  ok(
    "tenant B's sheets are still APPROVED",
    (await sheets(b)).every((sheet) => sheet.status === 'APPROVED'),
    JSON.stringify((await sheets(b)).map((sheet) => sheet.status)),
  );
}

await db.end();
console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
