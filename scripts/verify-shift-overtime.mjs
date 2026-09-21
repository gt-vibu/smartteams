#!/usr/bin/env node
/**
 * Shifts and the overtime they produce, end to end: a shift is created and assigned, a day's
 * attendance is recorded, and overtime is measured against that shift rather than one company-wide
 * standard day. Work on a weekly off is all overtime. Moving someone to another shift ends the
 * old one the day before. The overtime then reaches the timesheet that payroll pays it from.
 *
 *   pnpm verify:shift-overtime
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const t = await tenant('so');

/** The most recent past date that falls on an ISO weekday (1 Monday … 7 Sunday). */
function lastWeekday(isoWeekday, weeksBack = 1) {
  const d = new Date(`${t.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7 * weeksBack);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWeekday) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// A name is all the app sends; the server makes the code from it.
const shift = async (name, startsAt, endsAt, breakMinutes, daysOfWeek = [1, 2, 3, 4, 5]) =>
  (
    await t.org('POST', '/shifts', {
      name,
      daysOfWeek,
      startsAt,
      endsAt,
      crossesMidnight: false,
      breakMinutes,
    })
  ).payload;

/** An administrator records a whole day: in at `from`, out at `to`, Indian time. */
async function workDay(employeeId, date, from, to) {
  const at = (hhmm) => `${date}T${hhmm}:00+05:30`;
  const body = (occurredAt) => ({ employeeId, occurredAt, workDate: date, branchId: t.branchId });
  await t.org('POST', '/attendance/check-ins', body(at(from)));
  await t.org('POST', '/attendance/check-outs', body(at(to)));
  const r = await t.org('GET', `/attendance?employeeId=${employeeId}&from=${date}&to=${date}`);
  return rows(r.payload?.records ?? r.payload).find((x) => x.workDate.slice(0, 10) === date);
}

console.log('\nOvertime against the shift');
const short = await shift('Short Day', '09:00', '15:00', 0);
ok('a six-hour shift is created from a name alone', Boolean(short?.id), short?.name);
ok('its code is made from the name', short?.code === 'SHORT-DAY', short?.code);
const sameName = await shift('Short Day', '10:00', '16:00', 0);
ok(
  'a second shift of the same name still gets its own code',
  sameName?.code === 'SHORT-DAY-2',
  sameName?.code,
);
const monday = lastWeekday(1, 2);
let r = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: short.id,
  startsOn: '2026-01-01',
});
ok('it is assigned to an employee, open-ended', good(r), status(r));
let day = await workDay(t.a.id, monday, '09:00', '17:00');
ok(
  'eight hours on a six-hour shift is two hours of overtime',
  day?.workedMinutes === 480 && day?.overtimeMinutes === 120,
  `${day?.workedMinutes} worked, ${day?.overtimeMinutes} overtime`,
);
const sunday = lastWeekday(7, 2);
day = await workDay(t.a.id, sunday, '10:00', '13:00');
ok(
  'work on a day the shift does not run is all overtime',
  day?.workedMinutes === 180 && day?.overtimeMinutes === 180,
  `${day?.workedMinutes} worked, ${day?.overtimeMinutes} overtime`,
);
day = await workDay(t.b.id, monday, '09:00', '17:00');
ok(
  'someone with no shift is measured against the standard day as before',
  day?.workedMinutes === 480 && day?.overtimeMinutes === 0,
  `${day?.workedMinutes} worked, ${day?.overtimeMinutes} overtime`,
);

console.log('\nChanging shift');
const long = await shift('Long Day', '09:00', '19:00', 60);
const tuesday = lastWeekday(2, 1);
r = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: long.id,
  startsOn: tuesday,
});
ok('moving to another shift is accepted, not refused as an overlap', good(r), status(r));
r = await t.org('GET', `/shifts/assignments?employeeId=${t.a.id}&includeEnded=true`);
const mine = rows(r.payload?.items ?? r.payload);
const ended = mine.find((row) => row.shift.id === short.id);
const expectedEnd = new Date(new Date(`${tuesday}T00:00:00Z`).getTime() - 86_400_000)
  .toISOString()
  .slice(0, 10);
ok('the old shift ended the day before', ended?.endsOn === expectedEnd, ended?.endsOn);
day = await workDay(t.a.id, tuesday, '09:00', '19:00');
ok(
  'staying the whole of the new ten-hour shift (break included) is no overtime',
  day?.workedMinutes === 600 && day?.overtimeMinutes === 0,
  `${day?.workedMinutes} worked, ${day?.overtimeMinutes} overtime`,
);

console.log('\nOvertime reaches the timesheet');
const period = await t.org('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart: `${monday.slice(0, 8)}01`,
  periodEnd: t.today,
});
await t.org('POST', `/timesheets/periods/${period.payload?.id}/derive`, {});
const sheet = rows((await t.org('GET', '/timesheets')).payload).find(
  (s) => s.employeeId === t.a.id && s.periodId === period.payload?.id,
);
ok(
  "the employee's timesheet carries the shift overtime",
  (sheet?.overtimeMinutes ?? 0) >= 120,
  `${sheet?.overtimeMinutes} overtime minutes`,
);

console.log('\nOvertime rates');
r = await t.org('GET', '/payroll/overtime-rates');
ok(
  'the company starts at 1.5x with no special rate for weekly offs or holidays',
  good(r) &&
    r.payload?.standard === 1.5 &&
    r.payload?.weeklyOff === null &&
    r.payload?.holiday === null,
  JSON.stringify(r.payload),
);
r = await t.org('PUT', '/payroll/overtime-rates', { standard: 1.5, weeklyOff: 2, holiday: 3 });
ok(
  'a weekly-off and a holiday rate can be set',
  good(r) && r.payload?.weeklyOff === 2 && r.payload?.holiday === 3,
  status(r),
);
r = await t.org('GET', '/payroll/overtime-rates');
ok('and they are read back', r.payload?.weeklyOff === 2 && r.payload?.holiday === 3, status(r));
r = await t.org('PUT', '/payroll/overtime-rates', { standard: 0 });
ok('a rate below the ordinary hourly rate is refused', r.status === 400, status(r));
r = await t.org('PUT', '/payroll/overtime-rates', { standard: 1.5, holiday: 99 });
ok('an implausible rate is refused', r.status === 400, status(r));
r = await t.org('PUT', '/payroll/overtime-rates', {
  standard: 1.5,
  weeklyOff: null,
  holiday: null,
});
ok(
  'clearing a rate returns to the employee multiplier',
  good(r) && r.payload?.holiday === null,
  status(r),
);
r = await t.a.as('PUT', '/payroll/overtime-rates', { standard: 2 });
ok('an employee cannot set what overtime pays', refused(r), status(r));

finish();
