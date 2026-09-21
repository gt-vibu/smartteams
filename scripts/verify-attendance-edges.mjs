#!/usr/bin/env node
/**
 * The attendance punch boundaries the existing suites do not pin.
 *
 * `verify-attendance`, `verify-missing-checkout`, `verify-auto-checkout` and
 * `verify-holiday-checkin` already cover the ordinary day, corrections and the optional-holiday
 * review. What none of them assert is what happens when the punch sequence itself is wrong:
 * checking in twice, checking out with nothing open, checking out before the check-in, punching
 * into the future, punching for somebody else, and punching for someone who has left.
 *
 * Each check asserts the recorded state as well as the status: a refusal must leave the day
 * exactly as it was, and an unresolved holiday conflict must not read as an ordinary worked day.
 *
 *   pnpm verify:attendance-edges
 */
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const t = await tenant('ae');

/** The most recent past weekday, so a punch never lands on a weekly off. */
function lastWeekday(weeksBack = 1) {
  const d = new Date(`${t.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7 * weeksBack);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const at = (date, hhmm) => `${date}T${hhmm}:00+05:30`;
const punch = (kind, employeeId, date, hhmm, as = t.org) =>
  as('POST', `/attendance/check-${kind}s`, {
    employeeId,
    occurredAt: at(date, hhmm),
    workDate: date,
    branchId: t.branchId,
  });

async function day(employeeId, date) {
  const r = await t.org('GET', `/attendance?employeeId=${employeeId}&from=${date}&to=${date}`);
  return rows(r.payload?.records ?? r.payload).find((x) => x.workDate.slice(0, 10) === date);
}

const workDate = lastWeekday(1);

console.log('\ncheck-in sequence');
let r = await punch('in', t.a.id, workDate, '09:00');
ok('a first check-in is accepted', good(r), status(r));
r = await punch('in', t.a.id, workDate, '09:30');
ok('a second check-in while one is open is refused', r.status === 409, status(r));
let record = await day(t.a.id, workDate);
ok(
  'and the refused punch left one check-in on the day',
  (record?.punches ?? []).filter((p) => p.punchType === 'IN').length === 1,
  `${(record?.punches ?? []).length} punches`,
);

console.log('\ncheck-out sequence');
r = await punch('out', t.a.id, workDate, '08:00');
ok('a check-out before the check-in is refused', r.status === 409, status(r));
r = await punch('out', t.a.id, workDate, '18:00');
ok('a check-out after it is accepted', good(r), status(r));
r = await punch('out', t.a.id, workDate, '18:30');
ok('a second check-out with nothing open is refused', r.status === 409, status(r));
record = await day(t.a.id, workDate);
ok(
  'the closed day carries exactly one pair',
  (record?.punches ?? []).length === 2 && record?.workedMinutes === 540,
  `${(record?.punches ?? []).length} punches, ${record?.workedMinutes} minutes`,
);

console.log('\na second session on the same day');
r = await punch('in', t.a.id, workDate, '19:00');
const secondSession = good(r);
ok(
  'checking in again after a check-out is either allowed or refused, never a server error',
  secondSession || r.status === 409,
  status(r),
);
if (secondSession) {
  r = await punch('out', t.a.id, workDate, '20:00');
  ok('and its check-out closes it', good(r), status(r));
  record = await day(t.a.id, workDate);
  ok(
    'both sessions are totalled, not overwritten',
    record?.workedMinutes === 600,
    `${record?.workedMinutes} minutes`,
  );
}

console.log('\nimpossible and unauthorized punches');
const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
r = await punch('in', t.a.id, future, '09:00');
ok('a punch on a future date is refused', r.status === 409 || r.status === 400, status(r));
r = await t.a.as('POST', '/attendance/check-ins', {
  employeeId: t.b.id,
  occurredAt: at(t.today, '09:00'),
  workDate: t.today,
  branchId: t.branchId,
});
ok('an employee cannot punch for a colleague', r.status === 403, status(r));
r = await t.org('POST', '/attendance/check-ins', {
  employeeId: '00000000-0000-4000-8000-000000000000',
  occurredAt: at(t.today, '09:00'),
  workDate: t.today,
  branchId: t.branchId,
});
ok('a forged employee id is not found', r.status === 404, status(r));

console.log('\nsomeone who has left');
const leaver = await t.org('POST', '/employees', {
  firstName: 'Leaver',
  lastName: 'Gone',
  workEmail: `leaver-${Date.now()}@edge.test`,
  dateOfJoining: '2026-01-01',
  employmentType: 'FULL_TIME',
  primaryBranchId: t.branchId,
  aadhaarNumber: (await import('./lib/aadhaar.mjs')).testAadhaar(),
});
ok('an employee is created to be deactivated', good(leaver), status(leaver));
r = await t.org('POST', `/employees/${leaver.payload?.id}/deactivate`, {
  reason: 'Left the company for the edge suite',
});
ok('the employee is deactivated', good(r), status(r));
r = await punch('in', leaver.payload?.id, t.today, '09:00');
ok(
  'a punch for a former employee is refused, not silently filed',
  r.status === 409 || r.status === 403 || r.status === 404,
  status(r),
);

console.log('\nan unresolved optional-holiday conflict is not an ordinary day');
// Today: an optional holiday can only be taken for a date that has not passed.
const holidayDate = t.today;
r = await t.org('POST', '/holidays', {
  holidayDate,
  name: `Edge Optional ${Date.now() % 10000}`,
  isOptional: true,
  branchId: t.branchId,
});
ok('an optional holiday exists', good(r), status(r));
const holidayId = r.payload?.id ?? rows(r.payload)[0]?.id;
await t.org('PATCH', '/holidays/settings', { optionalHolidayAllowance: 2 });
r = await t.b.as('POST', '/holidays/select', { holidayIds: [holidayId] });
const selected = good(r);
ok('the employee holds that optional holiday', selected, status(r));
if (selected) {
  r = await t.b.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: holidayDate,
    branchId: t.branchId,
  });
  ok('a check-in on that holiday is accepted', good(r), status(r));
  ok(
    'the reply itself says the day needs a reason',
    r.payload?.holidayConflict?.state === 'AWAITING_REASON',
    String(r.payload?.holidayConflict?.state),
  );
  const conflicts = await t.b.as(
    'GET',
    `/attendance/holiday-conflicts?from=${holidayDate}&to=${holidayDate}`,
  );
  const conflict = rows(conflicts.payload)[0];
  ok(
    'and it waits as an unresolved conflict, not a settled day',
    conflict?.state === 'AWAITING_REASON' || conflict?.state === 'AWAITING_DECISION',
    String(conflict?.state),
  );
}

console.log('\nconcurrency: two punches at once');
const raceDate = lastWeekday(3);
const [p1, p2] = await Promise.all([
  punch('in', t.b.id, raceDate, '09:00'),
  punch('in', t.b.id, raceDate, '09:00'),
]);
ok(
  'two simultaneous check-ins record one open session',
  [p1.status, p2.status].filter((s) => s === 201 || s === 200).length === 1,
  `${p1.status} and ${p2.status}`,
);
record = await day(t.b.id, raceDate);
ok(
  'and the day holds a single check-in',
  (record?.punches ?? []).filter((p) => p.punchType === 'IN').length === 1,
  `${(record?.punches ?? []).length} punches`,
);

finish();
