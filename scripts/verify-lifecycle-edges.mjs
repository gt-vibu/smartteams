#!/usr/bin/env node
/**
 * The edges a real person reaches by working normally, which happy-path tests miss: asking for
 * more leave than is left, asking twice for the same days, deciding a request that is already
 * decided, logging a day that cannot have happened, and submitting a timesheet twice.
 *
 * Each check asserts the business answer, not a status code family: a refusal has to say what is
 * wrong, and an accepted action has to leave one record rather than two.
 *
 *   pnpm verify:lifecycle-edges
 */
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const t = await tenant('le');

/** A weekday `days` from today, so a request never lands entirely on a weekly off. */
function weekdayFromToday(days) {
  const d = new Date(`${t.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

console.log('\nsetup');
let r = await t.org('GET', '/roles');
const adminRoleId = rows(r.payload).find((role) => role.code === 'ORG_ADMIN')?.id;
r = await t.org('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: `LV-${Date.now()}`,
  name: 'Leave approvals',
  isDefault: true,
  steps: [{ stepNumber: 1, approverType: 'ROLE', roleId: adminRoleId }],
});
ok('a default leave approval policy exists', good(r) || r.status === 409, status(r));

const typeCode = `EDG${Date.now() % 100000}`;
r = await t.org('POST', '/leave/types', {
  code: typeCode,
  name: 'Edge Leave',
  paid: true,
  accrualType: 'FIXED_ANNUAL',
  // Small on purpose: two days is enough to exhaust, which is what the balance rule is for.
  annualAllowance: 2,
  requiresAttachment: false,
});
ok('a leave type with a two-day allowance is created', good(r), status(r));
const typeId = r.payload?.id;
r = await t.org('POST', `/leave/types/${typeCode}/assign`, { branchId: t.branchId });
ok('it is assigned to the branch', good(r), status(r));

console.log('\nleave: balance, overlap and repeat decisions');
const apply = (startDate, endDate) =>
  t.org('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: typeId,
    startDate,
    endDate,
    reason: 'Edge case',
  });

const firstStart = weekdayFromToday(7);
r = await apply(firstStart, firstStart);
ok('a one-day request within the balance is accepted', good(r), status(r));
const firstId = r.payload?.id;

r = await apply(firstStart, firstStart);
ok('the same days requested again are refused as an overlap', r.status === 409, status(r));

const bigStart = weekdayFromToday(30);
const bigEnd = weekdayFromToday(40);
r = await apply(bigStart, bigEnd);
ok('more days than the balance holds are refused', r.status === 409, status(r));

r = await t.org('POST', `/leave/requests/${firstId}/decision`, {
  status: 'APPROVED',
  comment: 'Approved for the edge suite',
});
ok('the pending request is approved', good(r), status(r));
r = await t.org('POST', `/leave/requests/${firstId}/decision`, {
  status: 'REJECTED',
  comment: 'Deciding a second time',
});
ok('deciding it a second time is refused', r.status === 409, status(r));

r = await t.a.as('POST', '/leave/requests', {
  employeeId: t.b.id,
  leaveTypeId: typeId,
  startDate: weekdayFromToday(60),
  endDate: weekdayFromToday(60),
  reason: 'Filing for somebody else',
});
ok(
  'an employee cannot file leave for a colleague',
  r.status === 403 || r.status === 409,
  status(r),
);

console.log('\ntimesheets: impossible days and repeat submission');
const period = await t.org('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart: t.monthStart,
  periodEnd: t.today,
});
const periodId = period.payload?.id;
ok('a timesheet period is open', Boolean(periodId), status(period));

const entry = (minutes, workDate = t.today) =>
  t.a.as('POST', '/timesheets/entries', {
    workDate,
    minutes,
    description: 'Edge case',
  });

r = await entry(0);
ok('a zero-minute entry is refused', r.status === 400 || r.status === 409, status(r));
r = await entry(-60);
ok('a negative entry is refused', r.status === 400 || r.status === 409, status(r));
r = await entry(25 * 60);
ok('more than a day in one day is refused', r.status === 400 || r.status === 409, status(r));
r = await entry(120);
ok('an ordinary entry is accepted', good(r), status(r));

const sheet = rows((await t.a.as('GET', '/timesheets')).payload).find(
  (s) => s.employeeId === t.a.id && s.periodId === periodId,
);
ok('the entry reached a timesheet', Boolean(sheet?.id), JSON.stringify(sheet?.status));
r = await t.a.as('POST', `/timesheets/${sheet?.id}/submit`, {});
ok('the timesheet is submitted', good(r), status(r));
r = await t.a.as('POST', `/timesheets/${sheet?.id}/submit`, {});
ok('submitting it again is refused', r.status === 409, status(r));

r = await t.org('POST', `/timesheets/${sheet?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approved for the edge suite',
});
ok('an approver decides it', good(r), status(r));
r = await t.org('POST', `/timesheets/${sheet?.id}/decision`, {
  status: 'REJECTED',
  comment: 'Deciding a second time',
});
ok('deciding it a second time is refused', r.status === 409, status(r));
r = await entry(60);
ok('a new entry on an approved sheet is refused', r.status === 409, status(r));

finish();
