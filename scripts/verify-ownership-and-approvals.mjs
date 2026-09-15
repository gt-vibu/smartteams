#!/usr/bin/env node
/**
 * Ownership of records reached by their own id, and nobody deciding their own request.
 *
 * `verify-authorization-boundaries` covers acting on a colleague by naming their employee id. This
 * covers the paths that audit found still open, each driven by a real signed-in employee:
 *
 *  - cancelling a colleague's leave, which needed only the permission to raise your own;
 *  - opening or re-deriving a timesheet period, which rewrites everyone's sheet and withdrew
 *    approvals already given, on the strength of the permission to log your own time;
 *  - uploading files against a colleague, or filing a "payslip", with the permission to upload
 *    your own documents;
 *  - raising a salary advance for a colleague, which was refused as a conflict rather than as
 *    forbidden;
 *  - approving your own timesheet or your own salary advance.
 *
 * Every refusal is paired with the case that must still work, and with a check that the refused
 * request changed nothing.
 *
 *   pnpm verify:ownership-and-approvals
 */
import { weekdaysAgo } from './lib/dates.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const t = await tenant('ow', { defaultPolicies: false });
const status = (r) => 'HTTP ' + r.status;

// A custom role that decides timesheets and salary advances, held by both employees, so each can
// decide the other's request and the only thing standing between one and their own is the rule.
const approverRole = await t.org('POST', '/roles', {
  code: 'OW_APPROVER',
  name: 'Timesheet and advance approver',
  scope: 'ORGANIZATION',
  permissionKeys: [
    'timesheets.decide',
    'payroll.advances.read',
    'payroll.advances.request',
    'payroll.advances.approve',
  ],
});
ok('setup: an approver role can carry the payroll keys', good(approverRole), status(approverRole));
for (const employee of [t.a, t.b]) {
  const assigned = await t.org('POST', '/role-assignments', {
    userId: employee.userId,
    roleId: approverRole.payload?.id,
  });
  ok('setup: the approver role is assigned', good(assigned), status(assigned));
}
const timesheetPolicy = await t.org('POST', '/approval-policies', {
  domain: 'TIMESHEET',
  code: 'OW_TS',
  name: 'Timesheets decided by approvers',
  isDefault: true,
  steps: [
    { stepNumber: 1, approverType: 'ROLE', roleId: approverRole.payload?.id, required: true },
  ],
});
ok('setup: timesheets route to the approver role', good(timesheetPolicy), status(timesheetPolicy));

console.log('\nleave cancellation');
{
  const paid = rows((await t.a.as('GET', '/leave/types')).payload).find((type) => type.paid);
  const own = await t.a.as('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: paid?.id,
    startDate: weekdaysAgo(4),
    endDate: weekdaysAgo(4),
    reason: 'A day off for a family function',
  });
  ok('setup: an employee requests leave', good(own), status(own));
  const requestId = own.payload?.id;

  const byColleague = await t.b.as('POST', '/leave/requests/' + requestId + '/cancel', {
    reason: 'Cancelling a colleague leave',
  });
  ok("an employee may not cancel a colleague's leave", refused(byColleague), status(byColleague));
  const after = rows((await t.org('GET', '/leave/requests?employeeId=' + t.a.id)).payload).find(
    (request) => request.id === requestId,
  );
  ok('and the request is untouched', after?.status === 'PENDING', String(after?.status));

  const byOwner = await t.a.as('POST', '/leave/requests/' + requestId + '/cancel', {
    reason: 'Plans changed',
  });
  ok('the employee may cancel their own', good(byOwner), status(byOwner));
}

console.log('\ntimesheet periods');
{
  const period = { periodType: 'MONTHLY', periodStart: t.monthStart, periodEnd: t.today };
  const byEmployee = await t.a.as('POST', '/timesheets/periods', period);
  ok('an employee may not open a period', refused(byEmployee), status(byEmployee));

  const opened = await t.org('POST', '/timesheets/periods', period);
  ok('an administrator may', good(opened), status(opened));

  const deriveByEmployee = await t.a.as(
    'POST',
    '/timesheets/periods/' + opened.payload?.id + '/derive',
    {},
  );
  ok(
    "an employee may not re-derive everyone's sheets",
    refused(deriveByEmployee),
    status(deriveByEmployee),
  );
  const derived = await t.org('POST', '/timesheets/periods/' + opened.payload?.id + '/derive', {});
  ok('an administrator may', good(derived), status(derived));
}

console.log('\nself-approval of a timesheet');
{
  const logged = await t.a.as('POST', '/timesheets/entries', {
    workDate: t.today,
    minutes: 120,
    description: 'Release preparation',
  });
  ok('setup: an approver logs their own time', good(logged), status(logged));
  const sheetId = logged.payload?.timesheet?.id;
  const submitted = await t.a.as('POST', '/timesheets/' + sheetId + '/submit', {});
  ok('setup: and submits it', good(submitted), status(submitted));

  const ownDecision = await t.a.as('POST', '/timesheets/' + sheetId + '/decision', {
    status: 'APPROVED',
    comment: 'Approving my own hours',
  });
  ok(
    'an approver may not approve their own timesheet',
    ownDecision.status === 403,
    status(ownDecision),
  );
  const still = rows((await t.org('GET', '/timesheets?employeeId=' + t.a.id)).payload).find(
    (sheet) => sheet.id === sheetId,
  );
  ok('and it is still awaiting a decision', still?.status === 'SUBMITTED', String(still?.status));

  const colleagueDecision = await t.b.as('POST', '/timesheets/' + sheetId + '/decision', {
    status: 'APPROVED',
    comment: 'Hours match the release plan',
  });
  ok(
    'a colleague with the same role may approve it',
    good(colleagueDecision),
    status(colleagueDecision),
  );
}

console.log('\nsalary advances');
{
  const forColleague = await t.a.as('POST', '/payroll/advances', {
    employeeId: t.b.id,
    requestedAmount: 5000,
    reason: 'Raising an advance for a colleague',
  });
  ok(
    'an employee may not raise an advance for a colleague, and is told it is forbidden',
    forColleague.status === 403,
    status(forColleague),
  );

  const own = await t.a.as('POST', '/payroll/advances', {
    employeeId: t.a.id,
    requestedAmount: 5000,
    reason: 'Medical bill due before payday',
  });
  ok('an employee may raise their own', good(own), status(own));

  const selfDecision = await t.a.as('POST', '/payroll/advances/' + own.payload?.id + '/decision', {
    status: 'APPROVED',
    comment: 'Approving my own advance',
  });
  ok(
    'an approver may not approve their own advance',
    selfDecision.status === 403,
    status(selfDecision),
  );

  const decision = await t.b.as('POST', '/payroll/advances/' + own.payload?.id + '/decision', {
    status: 'APPROVED',
    comment: 'Within policy for the month',
  });
  ok('a colleague with the same role may approve it', good(decision), status(decision));

  // The list pages: one advance per page here, followed by its cursor to the end.
  await t.b.as('POST', '/payroll/advances', {
    employeeId: t.b.id,
    requestedAmount: 3000,
    reason: 'School fees due this week',
  });
  const first = await t.org('GET', '/payroll/advances?limit=1');
  ok(
    'the advance list returns one page and a cursor',
    rows(first.payload).length === 1 && typeof first.payload?.nextCursor === 'string',
    status(first) + ', ' + rows(first.payload).length + ' item(s)',
  );
  const second = await t.org(
    'GET',
    '/payroll/advances?limit=1&cursor=' + encodeURIComponent(first.payload?.nextCursor ?? ''),
  );
  const ids = [...rows(first.payload), ...rows(second.payload)].map((advance) => advance.id);
  ok(
    'and its cursor reaches the rest, without repeating an advance',
    ids.length === 2 && new Set(ids).size === 2 && !second.payload?.nextCursor,
    ids.length + ' across two pages',
  );
}

console.log('\nfile uploads');
{
  const upload = (extra) => ({
    purpose: 'EMPLOYEE_DOCUMENT',
    originalName: 'certificate.pdf',
    contentType: 'application/pdf',
    byteSize: 2048,
    ...extra,
  });
  const forColleague = await t.a.as('POST', '/files/uploads', upload({ employeeId: t.b.id }));
  ok(
    "an employee may not upload to a colleague's record",
    refused(forColleague),
    status(forColleague),
  );

  const payslip = await t.a.as(
    'POST',
    '/files/uploads',
    upload({ purpose: 'PAYSLIP', employeeId: t.a.id }),
  );
  ok('an employee may not file a payslip', payslip.status === 403, status(payslip));

  // Beginning an upload presigns a storage URL, which needs storage credentials. Without them the
  // API answers 500 after the authorization checks have passed; that proves nothing about the
  // upload itself, so it is reported as not verified rather than counted as a pass.
  const own = await t.a.as('POST', '/files/uploads', upload({ employeeId: t.a.id }));
  if (own.status === 500)
    console.log('  SKIP  their own upload begins  (HTTP 500: storage not configured here)');
  else {
    ok('their own upload begins', good(own), status(own));
    // Completing publishes the file, so it belongs to whoever began the upload.
    const byColleague = await t.b.as('POST', '/files/' + own.payload?.fileId + '/complete', {});
    ok(
      "a colleague may not complete someone else's upload",
      refused(byColleague),
      status(byColleague),
    );
  }
}

console.log("\nreading a colleague's records");
{
  // Give the colleague something to leak in each area first.
  await t.b.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  const paid = rows((await t.b.as('GET', '/leave/types')).payload).find((type) => type.paid);
  await t.b.as('POST', '/leave/requests', {
    employeeId: t.b.id,
    leaveTypeId: paid?.id,
    startDate: weekdaysAgo(6),
    endDate: weekdaysAgo(6),
    reason: 'A day for a medical appointment',
  });
  await t.b.as('POST', '/timesheets/entries', {
    workDate: t.today,
    minutes: 90,
    description: 'Colleague work',
  });

  // Refused outright (403/404/409, the read convention), or narrowed so nothing of theirs shows.
  const B = t.b.id;
  const leaksNothing = (r) =>
    [403, 404, 409].includes(r.status) ||
    (r.status === 200 && !JSON.stringify(r.payload ?? null).includes(B));
  for (const path of [
    `/employees/${B}`,
    `/employees/${B}/detail`,
    `/employees/${B}/emergency-contacts`,
    `/employees/${B}/employment-records`,
    `/attendance?employeeId=${B}&from=${t.monthStart}&to=${t.today}`,
    `/attendance/corrections?employeeId=${B}`,
    `/leave/requests?employeeId=${B}`,
    `/leave/balances?employeeId=${B}`,
    `/timesheets?employeeId=${B}`,
    `/payroll/profile?employeeId=${B}`,
    `/payroll/advances?employeeId=${B}`,
    `/payroll/payments?employeeId=${B}`,
    `/payroll/payslips?employeeId=${B}`,
    `/files?employeeId=${B}`,
    `/compliance/employees/${B}/profiles`,
    `/compliance/records?employeeId=${B}`,
    `/holidays/employee-policies/${B}`,
    `/holidays/selections?employeeId=${B}`,
  ]) {
    const r = await t.a.as('GET', path);
    ok(
      `an employee cannot read ${path.split('?')[0].replace(B, ':colleague')}`,
      leaksNothing(r),
      status(r),
    );
  }

  // The filter the integration guide documents; an undeclared query property used to make it 400.
  const filtered = await t.org('GET', `/compliance/records?employeeId=${B}`);
  ok(
    'an administrator can filter compliance records by employee',
    good(filtered),
    status(filtered),
  );

  // The same ids from another tenant's administrator, who holds every permission in their own.
  const other = await tenant('ox');
  for (const path of [`/employees/${B}`, `/timesheets?employeeId=${B}`]) {
    const r = await other.org('GET', path);
    ok(
      `another tenant's administrator cannot read ${path.split('?')[0].replace(B, ':id')}`,
      leaksNothing(r),
      status(r),
    );
  }
}

console.log('\nlogged hours are bounded by the day');
{
  // Employee B's sheet is still a draft; A's was approved above and would refuse for that reason.
  const day = weekdaysAgo(8);
  const dayLimit = (r) => r.status === 409 && /24 hours/.test(r.payload?.detail ?? '');
  const tooLong = await t.b.as('POST', '/timesheets/entries', {
    workDate: day,
    minutes: 100_000,
    description: 'An impossible day',
  });
  ok('a single entry longer than a day is refused', dayLimit(tooLong), status(tooLong));
  const fullDay = await t.b.as('POST', '/timesheets/entries', {
    workDate: day,
    minutes: 1_440,
    description: 'A full 24 hours',
  });
  ok('exactly 24 hours is accepted', good(fullDay), status(fullDay));
  const oneMore = await t.b.as('POST', '/timesheets/entries', {
    workDate: day,
    minutes: 1,
    description: 'One minute past the day',
  });
  ok('and one minute more on the same day is refused', dayLimit(oneMore), status(oneMore));
}

finish();
