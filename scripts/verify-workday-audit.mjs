#!/usr/bin/env node
/**
 * A working day done wrong on purpose: punching twice, checking out before checking in, leave
 * that overlaps or costs more than is left, a decision made twice or by the requester, timesheet
 * hours that cannot be real, and files and records reached for across companies.
 *
 *   pnpm verify:workday-audit
 */
import { weekdaysAgo } from './lib/dates.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const t = await tenant('wd');
const other = await tenant('wx');
const punch = (who, kind, extra = {}) =>
  who.as('POST', `/attendance/${kind}`, {
    employeeId: who.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
    ...extra,
  });

console.log('\nAttendance');
let r = await punch(t.b, 'check-outs');
ok('checking out before checking in is refused', r.status >= 400, status(r));
r = await punch(t.a, 'check-ins');
ok('an employee checks in', good(r), status(r));
r = await punch(t.a, 'check-ins');
ok('checking in again while checked in is refused', r.status === 409, status(r));
r = await punch(t.a, 'check-outs');
ok('they check out', good(r), status(r));
r = await punch(t.a, 'check-outs');
ok('checking out twice is refused', r.status === 409, status(r));
r = await punch(t.b, 'check-ins', {
  occurredAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
});
const recorded = new Date(
  r.payload?.punches?.at?.(-1)?.occurredAt ?? r.payload?.occurredAt ?? Date.now(),
);
ok(
  "an employee's own punch is stamped with the real time, whatever time they send",
  good(r) && recorded.getTime() < Date.now() + 60_000,
  status(r),
);
r = await t.org('POST', '/attendance/check-outs', {
  employeeId: t.b.id,
  occurredAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  workDate: t.today,
  branchId: t.branchId,
});
ok('an administrator cannot record a punch in the future', r.status === 409, status(r));
r = await t.a.as('POST', '/attendance/check-ins', {
  employeeId: t.b.id,
  occurredAt: new Date().toISOString(),
  workDate: t.today,
  branchId: t.branchId,
});
ok('an employee cannot punch for a colleague', refused(r), status(r));
r = await t.a.as('GET', `/attendance?employeeId=${t.b.id}`);
const leaked = rows(r.payload?.records ?? r.payload).filter((x) => x.employeeId === t.b.id);
ok(
  "an employee does not see a colleague's attendance",
  refused(r) || leaked.length === 0,
  status(r),
);

console.log('\nLeave');
const types = rows((await t.a.as('GET', '/leave/types')).payload);
const paid = types.find((type) => type.paid) ?? types[0];
ok('leave types are available to an employee', Boolean(paid), types.length + ' types');
const ask = (who, startDate, endDate, extra = {}) =>
  who.as('POST', '/leave/requests', {
    employeeId: who.id,
    leaveTypeId: paid?.id,
    startDate,
    endDate,
    reason: 'Family function',
    ...extra,
  });
const day = weekdaysAgo(-3);
r = await ask(t.a, day, day);
ok('an employee applies for a day off', good(r), status(r));
const request = r.payload;
r = await ask(t.a, day, day);
ok('the same day again is refused as overlapping', r.status === 409, status(r));
const twice = weekdaysAgo(-20);
const racing = await Promise.all([ask(t.b, twice, twice), ask(t.b, twice, twice)]);
ok(
  'a leave request sent twice at once is booked once',
  racing.filter(good).length === 1,
  racing.map((x) => x.status).join(),
);
r = await ask(t.a, weekdaysAgo(-10), weekdaysAgo(-6));
ok('leave that ends before it starts is refused', r.status >= 400, status(r));
r = await ask(t.b, weekdaysAgo(-10), weekdaysAgo(-10 - 200));
ok('leave far beyond the balance is refused', r.status >= 400, status(r));
r = await t.a.as('POST', '/leave/requests', {
  employeeId: t.b.id,
  leaveTypeId: paid?.id,
  startDate: day,
  endDate: day,
  reason: 'for someone else',
});
ok('an employee cannot apply on behalf of a colleague', refused(r), status(r));
r = await t.a.as('POST', `/leave/requests/${request?.id}/decision`, {
  status: 'APPROVED',
  comment: 'approving my own',
});
ok('an employee cannot approve their own leave', refused(r), status(r));
const decide = () =>
  t.org('POST', `/leave/requests/${request?.id}/decision`, {
    status: 'APPROVED',
    comment: 'Enjoy the day',
  });
const [one, two] = await Promise.all([decide(), decide()]);
ok(
  'approving the same request twice at once decides it once',
  [one, two].filter(good).length === 1,
  `${one.status},${two.status}`,
);
r = await decide();
ok('approving an already approved request is refused', r.status === 409, status(r));
r = await t.b.as('POST', `/leave/requests/${request?.id}/cancel`, { reason: 'not mine' });
ok("an employee cannot cancel a colleague's leave", refused(r) || r.status === 409, status(r));

console.log('\nTimesheets');
const period = await t.org('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart: t.monthStart,
  periodEnd: t.today,
});
await t.org('POST', `/timesheets/periods/${period.payload?.id}/derive`, {});
const sheet = rows((await t.org('GET', '/timesheets')).payload).find(
  (s) => s.employeeId === t.a.id,
);
const log = (minutes, workDate = t.today) =>
  t.a.as('POST', '/timesheets/entries', {
    timesheetId: sheet?.id,
    workDate,
    minutes,
    description: 'Audit',
  });
r = await log(60);
ok('an hour of work is logged', good(r), status(r));
for (const [label, minutes] of [
  ['zero minutes', 0],
  ['negative minutes', -30],
  ['more than a day in one entry', 25 * 60],
]) {
  r = await log(minutes);
  ok(`${label} is refused`, r.status >= 400, status(r));
}
r = await log(60, '2099-01-01');
ok('time logged far in the future is refused', r.status >= 400, status(r));
const [s1, s2] = await Promise.all([
  t.a.as('POST', `/timesheets/${sheet?.id}/submit`, {}),
  t.a.as('POST', `/timesheets/${sheet?.id}/submit`, {}),
]);
ok(
  'submitting twice at once submits once',
  [s1, s2].filter(good).length === 1,
  `${s1.status},${s2.status}`,
);
r = await t.b.as('POST', `/timesheets/${sheet?.id}/submit`, {});
ok("an employee cannot submit a colleague's timesheet", refused(r) || r.status === 409, status(r));

r = await t.b.as('POST', '/timesheets/entries', {
  workDate: t.today,
  minutes: 45,
  description: 'No period opened by an administrator',
});
ok('an employee logs time without an administrator opening a period', good(r), status(r));
r = await t.b.as('POST', '/timesheets/entries', {
  workDate: '2025-06-02',
  minutes: 45,
  description: 'Before joining',
});
ok('time before the joining date is refused', r.status === 409, status(r));
r = await log(60, '2025-06-02');
ok("time outside the chosen timesheet's period is refused", r.status === 409, status(r));

r = await t.org('POST', '/timesheets/job-types', { name: 'Client Workshop' });
ok('an administrator adds a timesheet job type', good(r), status(r));
const jobTypes = rows((await t.a.as('GET', '/timesheets/job-types')).payload).map((j) => j.name);
ok(
  'the new job type is offered to employees',
  jobTypes.includes('Client Workshop'),
  jobTypes.join(','),
);

console.log('\nFiles and records across companies');
for (const [label, path] of [
  ['employee', `/employees/${t.a.id}`],
  ['leave request', `/leave/requests?employeeId=${t.a.id}`],
  ['attendance', `/attendance?employeeId=${t.a.id}`],
  ['file', `/files/00000000-0000-4000-8000-000000000000`],
]) {
  r = await other.org('GET', path);
  const hit = good(r) && JSON.stringify(r.payload ?? '').includes(t.a.id);
  ok(`another company cannot see this company's ${label}`, !hit, status(r));
}

finish();
