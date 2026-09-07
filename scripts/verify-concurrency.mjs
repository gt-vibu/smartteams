#!/usr/bin/env node
/**
 * What happens when the same mutation arrives twice at once.
 *
 * A retry, a double-clicked button and a proxy replay all look identical to the API: two requests,
 * no ordering, no shared client state. The question this answers is not "is there an idempotency
 * key" — it is "does the second request corrupt anything". Where the answer is no, the protection
 * is named in the assertion, so that removing it later fails a test rather than passing quietly.
 *
 * The protections in play are the ones the schema and the services already have:
 *
 *   - optimistic locking, via `version` columns incremented inside the transaction
 *   - state machines that refuse a transition from the state the first request left behind
 *   - unique constraints that make a duplicate row impossible to insert
 *   - transactions, which make each attempt all-or-nothing
 *
 *   pnpm verify:concurrency
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

const BASE = process.env.CONCURRENCY_API_URL ?? 'http://localhost:4000';
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:Qwerty%40123@localhost:5432/smarteam';

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
  for (const key of ['items', 'runs', 'requests', 'records', 'timesheets', 'data'])
    if (Array.isArray(payload[key])) return payload[key];
  return Object.values(payload).find((value) => Array.isArray(value)) ?? [];
};
const good = (r) => [200, 201, 204].includes(r.status);
const detail = (r) => {
  try {
    return JSON.parse(r.text).detail;
  } catch {
    return String(r.status);
  }
};
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
/** How many of a set of concurrent attempts succeeded. */
const succeeded = (results) => results.filter(good).length;

const db = new Client({ connectionString: DB });
await db.connect();
const count = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);

async function tenant(tag) {
  const cookies = jar();
  const slug = tag + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const credentials = {
    organizationName: 'CONC ' + slug,
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    email: 'boss@' + slug + '.test',
    displayName: 'Boss Person',
    password: 'Str0ng-Passw0rd!',
  };
  let response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  }
  if (!good(response))
    throw new Error('registration failed: HTTP ' + response.status + ' ' + detail(response));
  const csrf = { 'x-csrf-token': response.payload.csrfToken };
  const orgId = (await call(cookies, 'GET', '/v1/auth/me')).payload.organization.id;
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
  const email = 'e.' + slug + '@t.test';
  const employee = await org('POST', '/employees', {
    employeeNumber: 'EMP-1',
    firstName: 'Sam',
    lastName: 'Race',
    workEmail: email,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-01-01',
  });
  const member = await org('POST', '/members', {
    email,
    displayName: 'Sam Race',
    roleIds: [roles.find((r) => r.code === 'EMPLOYEE').id],
    reason: 'concurrency regression',
  });
  await org('POST', '/employees/' + employee.payload.id + '/user', {
    userId: member.payload.userId,
  });
  await org('POST', '/employees/' + employee.payload.id + '/branches', {
    branchId,
    startsOn: '2026-01-01',
    isPrimary: true,
  });
  await org('POST', '/payroll/profile', {
    employeeId: employee.payload.id,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: '2026-01-01',
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  const today = iso(new Date());
  return {
    org,
    orgId,
    cookies,
    csrf,
    employeeId: employee.payload.id,
    branchId,
    today,
    monthStart: today.slice(0, 8) + '01',
    slug,
  };
}

console.log('duplicate payroll calculation');
{
  const t = await tenant('cc1');
  const run = await t.org('POST', '/payroll/runs', {
    periodStart: t.monthStart,
    periodEnd: t.today,
    payFrequency: 'MONTHLY',
  });
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.org('POST', '/payroll/runs/' + run.payload.id + '/calculate', {}),
    ),
  );
  const lines = await count(
    'SELECT count(*)::int AS n FROM payroll_line_items WHERE payroll_run_id = $1',
    [run.payload.id],
  );
  const payments = await count(
    'SELECT count(*)::int AS n FROM payroll_payments WHERE payroll_run_id = $1',
    [run.payload.id],
  );
  // The state machine is the protection: only DRAFT, or CALCULATED-and-stale, may be calculated,
  // so whichever attempt lands first takes the run out of the state the others need.
  ok(
    'exactly one concurrent calculation is accepted',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  ok('one line item per employee, not one per attempt', lines === 1, lines + ' line items');
  ok('one payment per employee, not one per attempt', payments === 1, payments + ' payments');
}

console.log('\nduplicate payroll approval');
{
  const t = await tenant('cc2');
  const run = await t.org('POST', '/payroll/runs', {
    periodStart: t.monthStart,
    periodEnd: t.today,
    payFrequency: 'MONTHLY',
  });
  await t.org('POST', '/payroll/runs/' + run.payload.id + '/calculate', {});
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.org('POST', '/payroll/runs/' + run.payload.id + '/action', {
        target: 'APPROVED',
        comment: 'concurrent approval attempt',
      }),
    ),
  );
  const approvals = await count(
    'SELECT count(*)::int AS n FROM payroll_approvals WHERE payroll_run_id = $1',
    [run.payload.id],
  );
  const state = rows((await t.org('GET', '/payroll/runs')).payload).find(
    (x) => x.id === run.payload.id,
  );
  ok(
    'exactly one concurrent approval is accepted',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  // `@@unique([payrollRunId, approverUserId])` makes a second row impossible even if the
  // transition guard were bypassed, so this is belt and braces rather than the only protection.
  ok('one approval row, not one per attempt', approvals === 1, approvals + ' rows');
  ok('the run ends APPROVED exactly once', state?.status === 'APPROVED', String(state?.status));
}

console.log('\nduplicate advance approval');
{
  const t = await tenant('cc3');
  const advance = await t.org('POST', '/payroll/advances', {
    employeeId: t.employeeId,
    requestedAmount: 5000,
    reason: 'concurrency regression advance',
  });
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.org('POST', '/payroll/advances/' + advance.payload.id + '/decision', {
        status: 'APPROVED',
        comment: 'concurrent decision attempt',
      }),
    ),
  );
  const approved = await count(
    "SELECT count(*)::int AS n FROM salary_advances WHERE id = $1 AND status = 'APPROVED'",
    [advance.payload.id],
  );
  ok(
    'exactly one concurrent advance decision is accepted',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  ok('the advance is approved once', approved === 1, approved + ' approved row');
}

console.log('\nduplicate leave decision');
{
  const t = await tenant('cc4');
  const paid = rows((await t.org('GET', '/leave/types')).payload).find((x) => x.paid);
  const request = await t.org('POST', '/leave/requests', {
    employeeId: t.employeeId,
    leaveTypeId: paid.id,
    startDate: daysAgo(2),
    endDate: daysAgo(2),
    reason: 'concurrency regression leave',
  });
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.org('POST', '/leave/requests/' + request.payload.id + '/decision', {
        status: 'APPROVED',
        comment: 'concurrent decision attempt',
      }),
    ),
  );
  const approvals = await count(
    'SELECT count(*)::int AS n FROM leave_approvals WHERE leave_request_id = $1',
    [request.payload.id],
  );
  ok(
    'exactly one concurrent leave decision is accepted',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  // A second decision would need a second row for the same step, which the unique constraint
  // refuses; the balance reservation released by the first decision must not be released twice.
  ok('one approval row per step', approvals === 1, approvals + ' rows');
}

console.log('\nduplicate timesheet submission');
{
  const t = await tenant('cc5');
  await t.org('POST', '/attendance/check-ins', {
    employeeId: t.employeeId,
    occurredAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    workDate: daysAgo(3),
    branchId: t.branchId,
  });
  const period = await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  });
  await t.org('POST', '/timesheets/periods/' + period.payload.id + '/derive', {});
  const sheet = rows((await t.org('GET', '/timesheets')).payload)[0];
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () => t.org('POST', '/timesheets/' + sheet.id + '/submit', {})),
  );
  const state = rows((await t.org('GET', '/timesheets')).payload).find((x) => x.id === sheet.id);
  ok(
    'exactly one concurrent submission is accepted',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  ok('the sheet is SUBMITTED once', state?.status === 'SUBMITTED', String(state?.status));

  const decisions = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.org('POST', '/timesheets/' + sheet.id + '/decision', {
        status: 'APPROVED',
        comment: 'concurrent timesheet decision',
      }),
    ),
  );
  const approvals = await count(
    'SELECT count(*)::int AS n FROM timesheet_approvals WHERE timesheet_id = $1',
    [sheet.id],
  );
  ok(
    'exactly one concurrent timesheet decision is accepted',
    succeeded(decisions) === 1,
    succeeded(decisions) + ' of 4 accepted: ' + decisions.map((d) => d.status).join(','),
  );
  ok('one approval row for the cycle', approvals === 1, approvals + ' rows');
}

console.log('\nconcurrent version updates on one employee');
{
  const t = await tenant('cc6');
  const before = rows((await t.org('GET', '/employees')).payload).find(
    (e) => e.id === t.employeeId,
  );
  // Every writer sends the version it read, in the `if-match-version` header the controller
  // requires. Optimistic locking means the losers are told to re-read rather than silently
  // overwriting the winner.
  const attempts = await Promise.all(
    ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name) =>
      call(
        t.cookies,
        'PATCH',
        '/v1/organizations/' + t.orgId + '/employees/' + t.employeeId,
        { firstName: name },
        { ...t.csrf, 'if-match-version': String(before.version) },
      ),
    ),
  );
  const after = rows((await t.org('GET', '/employees')).payload).find((e) => e.id === t.employeeId);
  ok(
    'exactly one concurrent update wins',
    succeeded(attempts) === 1,
    succeeded(attempts) + ' of 4 accepted: ' + attempts.map((a) => a.status).join(','),
  );
  ok(
    'the version advanced exactly once',
    after.version === before.version + 1,
    before.version + ' -> ' + after.version,
  );
}

await db.end();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
