#!/usr/bin/env node
/**
 * A check-in on a granted optional holiday — against the running API.
 *
 * Two employees each have today's optional holiday approved, and each checks in anyway. The
 * check-in is accepted and flagged, never refused and never silently ignored. Each explains why;
 * the administrator keeps Ada's holiday and converts Bea's day into a working day. Then the
 * period's timesheets are derived and approved and the payroll run recalculated:
 *
 *   kept holiday     → the punches stay, the day counts 0 minutes, the timesheet carries nothing
 *                      for it, and Ada's pay is unchanged — the holiday is not counted twice.
 *   working day      → the selection is cancelled the existing way (audit + event), the day's
 *                      minutes stand, the timesheet carries them once, and Bea's pay moves only by
 *                      the overtime those minutes carry. There is no holiday-worked premium: that
 *                      needs a payroll policy decision, and none is invented here.
 *
 * Also: colleagues, other tenants, forged ids, the employee deciding their own day, and a second
 * decision are all refused.
 *
 *   pnpm verify:holiday-checkin
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { daysAgo, finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));

const t = await tenant('hc');
const other = await tenant('hx');
const TODAY = t.today;
const PERIOD_START = daysAgo(7);

// A self-service punch is stamped with the server's clock, so Ada's own day is short. Bea's day is
// recorded by the administrator from one minute past midnight IST until now, so it carries hours
// (and, after 08:01 IST, overtime) for the kept-versus-converted comparison to be meaningful.
const BEA_IN = new Date(`${TODAY}T00:01:00+05:30`).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('setup: an optional holiday today, granted to both employees');
await t.org('PATCH', '/holidays/settings', { optionalHolidayAllowance: 2 });
const holiday = await t.org('POST', '/holidays', {
  name: 'Harvest Festival',
  holidayDate: TODAY,
  isOptional: true,
});
ok('setup: the optional holiday is created', good(holiday), status(holiday));
for (const [who, employee] of [
  ['Ada', t.a],
  ['Bea', t.b],
]) {
  const selected = await employee.as('POST', '/holidays/select', {
    holidayIds: [holiday.payload?.id],
  });
  ok(`setup: ${who} has the holiday approved`, good(selected), status(selected));
  const profile = await t.org('POST', '/payroll/profile', {
    employeeId: employee.id,
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
  ok(`setup: ${who} has a salaried payroll profile`, good(profile), status(profile));
}

const run = await t.org('POST', '/payroll/runs', {
  periodStart: PERIOD_START,
  periodEnd: TODAY,
  payFrequency: 'MONTHLY',
});
const firstCalc = await t.org('POST', `/payroll/runs/${run.payload?.id}/calculate`, {});
ok('setup: a payroll run over the holiday is calculated', good(firstCalc), status(firstCalc));
const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const gross = async (employeeId) =>
  Number(
    (
      await one(
        'SELECT gross_amount FROM payroll_line_items WHERE payroll_run_id = $1 AND employee_id = $2',
        [run.payload?.id, employeeId],
      )
    )?.gross_amount,
  );
const grossBefore = { a: await gross(t.a.id), b: await gross(t.b.id) };
const runState = async () =>
  rows((await t.org('GET', '/payroll/runs')).payload).find((r) => r.id === run.payload?.id);

console.log('\nchecking in on the holiday');
const day = async (employee) =>
  rows(
    (await t.org('GET', `/attendance?employeeId=${employee.id}&from=${TODAY}&to=${TODAY}`)).payload,
  )[0];
const conflictOf = async (employee) =>
  rows(
    (await employee.as('GET', `/attendance/holiday-conflicts?from=${TODAY}&to=${TODAY}`)).payload,
  )[0];
const punch = (caller, type, employee, occurredAt) =>
  caller('POST', `/attendance/${type}`, {
    employeeId: employee.id,
    occurredAt,
    workDate: TODAY,
    branchId: t.branchId,
  });
const adaIn = await punch(t.a.as, 'check-ins', t.a, new Date().toISOString());
const adaInAt = Date.now();
ok(
  'Ada’s own check-in on her approved holiday is accepted, not refused',
  good(adaIn),
  status(adaIn),
);
ok(
  'and the reply tells her the day needs a reason',
  adaIn.payload?.holidayConflict?.state === 'AWAITING_REASON' &&
    adaIn.payload?.holidayConflict?.holiday?.name === 'Harvest Festival',
  String(adaIn.payload?.holidayConflict?.state),
);
const openConflict = await conflictOf(t.a);
ok(
  'the open day (no check-out yet) is listed as a conflict',
  openConflict?.state === 'AWAITING_REASON',
  String(openConflict?.state),
);
const beaIn = await punch(t.org, 'check-ins', t.b, BEA_IN);
const beaOut = await punch(t.org, 'check-outs', t.b, new Date(Date.now() - 30_000).toISOString());
ok(
  'setup: Bea’s day is recorded',
  good(beaIn) && good(beaOut),
  `${status(beaIn)} / ${status(beaOut)}`,
);
// A worked minute needs a minute on the clock.
await sleep(Math.max(0, adaInAt + 61_000 - Date.now()));
const adaOut = await punch(t.a.as, 'check-outs', t.a, new Date().toISOString());
ok('Ada’s check-out is accepted too', good(adaOut), status(adaOut));
const aDay = await day(t.a);
const bDay = await day(t.b);
ok('and the day is still awaiting a reason', (await conflictOf(t.a))?.state === 'AWAITING_REASON');
ok(
  'the day shows its worked time until someone decides',
  aDay?.workedMinutes > 0 && bDay?.workedMinutes > 0,
  `Ada ${aDay?.workedMinutes} min, Bea ${bDay?.workedMinutes} min`,
);

console.log('\nwho may explain, and who may decide');
const requestPath = (record) => `/attendance/${record?.id}/holiday-conflict`;
const reason = { reason: 'Asked to cover the quarter close', comment: 'Lead called me in' };
const byColleague = await t.b.as('POST', requestPath(aDay), reason);
ok("a colleague cannot explain someone else's day", refused(byColleague), status(byColleague));
const byOtherTenant = await other.org('POST', requestPath(aDay), reason);
ok('another tenant cannot reach the record', refused(byOtherTenant), status(byOtherTenant));
const peek = await t.b.as(
  'GET',
  `/attendance/holiday-conflicts?employeeId=${t.a.id}&from=${TODAY}&to=${TODAY}`,
);
ok("a colleague cannot list someone else's conflicts", peek.status === 409, status(peek));
const noReason = await t.a.as('POST', requestPath(aDay), { reason: 'x' });
ok('a missing or too-short reason is refused', noReason.status === 400, status(noReason));
const aReview = await t.a.as('POST', requestPath(aDay), reason);
ok('Ada explains the check-in', good(aReview), status(aReview));
const duplicate = await t.a.as('POST', requestPath(aDay), reason);
ok(
  'a second explanation while one awaits a decision is refused',
  duplicate.status === 409,
  status(duplicate),
);
ok(
  'and the day is now awaiting a decision',
  (await conflictOf(t.a))?.state === 'AWAITING_DECISION',
);

const decisionPath = (id) => `/attendance/holiday-conflicts/${id}/decision`;
const keep = { outcome: 'KEEP_HOLIDAY', comment: 'Cover was not needed; enjoy the holiday' };
const selfDecision = await t.a.as('POST', decisionPath(aReview.payload?.id), keep);
ok('Ada cannot decide her own day', selfDecision.status === 403, status(selfDecision));
const forged = await t.org('POST', decisionPath(randomUUID()), keep);
ok('a forged review id is not found', forged.status === 404, status(forged));
const malformed = await t.org('POST', decisionPath('not-a-uuid'), keep);
ok('a malformed review id is rejected', malformed.status === 400, status(malformed));
const foreignDecision = await other.org('POST', decisionPath(aReview.payload?.id), keep);
ok('another tenant cannot decide it', refused(foreignDecision), status(foreignDecision));
const noComment = await t.org('POST', decisionPath(aReview.payload?.id), {
  outcome: 'KEEP_HOLIDAY',
});
ok('a decision without a reason is refused', noComment.status === 400, status(noComment));
const inbox = rows((await t.org('GET', '/attendance/holiday-conflicts/inbox')).payload);
ok(
  'the administrator sees the explanation in their inbox',
  inbox.some((r) => r.id === aReview.payload?.id && r.reason === reason.reason),
  `${inbox.length} item(s)`,
);

console.log('\nkeep the holiday');
const kept = await t.org('POST', decisionPath(aReview.payload?.id), keep);
ok('the administrator keeps Ada’s holiday', good(kept), status(kept));
// The run was already marked stale by the check-in itself; the decision reports no run it could
// not reach (nothing over this date is approved or released).
ok(
  'and is told no approved or released run needs a payroll correction',
  (kept.payload?.payroll?.finalizedRuns ?? ['missing']).length === 0,
  JSON.stringify(kept.payload?.payroll),
);
const keptDay = await day(t.a);
ok(
  'the punches are kept as history',
  (keptDay?.punches ?? []).length === 2,
  String(keptDay?.punches?.length),
);
ok(
  'the day counts no worked time',
  keptDay?.workedMinutes === 0 && keptDay?.overtimeMinutes === 0 && keptDay?.status === 'REJECTED',
  `${keptDay?.status} ${keptDay?.workedMinutes}/${keptDay?.overtimeMinutes}`,
);
ok('the conflict shows as holiday kept', (await conflictOf(t.a))?.state === 'HOLIDAY_KEPT');
const aSelection = await one(
  'SELECT status FROM employee_holiday_selections WHERE employee_id = $1',
  [t.a.id],
);
ok('the holiday is still granted', aSelection?.status === 'CONFIRMED', String(aSelection?.status));
const again = await t.org('POST', decisionPath(aReview.payload?.id), {
  outcome: 'CONVERT_TO_WORKING_DAY',
  comment: 'Changed my mind',
});
ok('the review cannot be decided a second time', again.status === 409, status(again));

console.log('\nconvert to a working day');
const bReview = await t.b.as('POST', requestPath(bDay), {
  reason: 'Production support rota',
});
ok('Bea explains the check-in (no comment needed)', good(bReview), status(bReview));
const converted = await t.org('POST', decisionPath(bReview.payload?.id), {
  outcome: 'CONVERT_TO_WORKING_DAY',
  comment: 'Worked at our request',
});
ok('the administrator converts Bea’s day', good(converted), status(converted));
const bSelection = await one(
  'SELECT id, status, cancelled_at FROM employee_holiday_selections WHERE employee_id = $1',
  [t.b.id],
);
ok(
  'the holiday selection is cancelled',
  bSelection?.status === 'CANCELLED' && bSelection?.cancelled_at,
  String(bSelection?.status),
);
const convertedDay = await day(t.b);
ok(
  'the day’s attendance stands as recorded',
  convertedDay?.workedMinutes === bDay?.workedMinutes && convertedDay?.status === bDay?.status,
  `${convertedDay?.workedMinutes} min, ${convertedDay?.status}`,
);
ok(
  'the conflict shows as converted',
  (await conflictOf(t.b))?.state === 'CONVERTED_TO_WORKING_DAY',
);

console.log('\naudit');
const audited = async (entityId, action) =>
  Number(
    (
      await one('SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = $2', [
        entityId,
        action,
      ])
    )?.n,
  );
ok(
  'the explanation is audited',
  (await audited(aReview.payload?.id, 'ATTENDANCE_HOLIDAY_REVIEW_REQUESTED')) === 1,
);
ok(
  'keeping the holiday is audited',
  (await audited(aReview.payload?.id, 'ATTENDANCE_HOLIDAY_REVIEW_HOLIDAY_KEPT')) === 1,
);
ok(
  'converting the day is audited',
  (await audited(bReview.payload?.id, 'ATTENDANCE_HOLIDAY_REVIEW_CONVERTED')) === 1,
);
ok(
  'the cancellation is audited the same way as an employee’s own',
  (await audited(bSelection?.id, 'EMPLOYEE_HOLIDAY_CANCELLED')) === 1,
);
const event = await one(
  "SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'employee.holiday.cancelled'",
  [bSelection?.id],
);
ok('and emits the existing cancellation event', Number(event?.n) === 1, String(event?.n));

console.log('\ntimesheets and payroll');
ok('the calculated run is stale', Boolean((await runState())?.calculationStaleAt));
const period = await t.org('POST', '/timesheets/periods', {
  periodType: 'WEEKLY',
  periodStart: PERIOD_START,
  periodEnd: TODAY,
});
const derived = await t.org('POST', `/timesheets/periods/${period.payload?.id}/derive`, {});
ok('setup: the period’s timesheets are derived', good(derived), status(derived));
const sheetOf = async (employee) =>
  rows((await t.org('GET', `/timesheets?employeeId=${employee.id}`)).payload).find(
    (s) => s.periodId === period.payload?.id,
  );
const holidayEntry = (sheet) =>
  (sheet?.entries ?? []).filter((e) => String(e.workDate).slice(0, 10) === TODAY);
const aSheet = await sheetOf(t.a);
const bSheet = await sheetOf(t.b);
ok(
  'the kept holiday puts no minutes on Ada’s timesheet',
  holidayEntry(aSheet).reduce((sum, e) => sum + e.minutes, 0) === 0 && aSheet?.totalMinutes === 0,
  `${aSheet?.totalMinutes} min`,
);
ok(
  'the working day puts its minutes on Bea’s timesheet exactly once',
  holidayEntry(bSheet).length === 1 &&
    holidayEntry(bSheet)[0]?.minutes === convertedDay?.workedMinutes &&
    bSheet?.totalMinutes === convertedDay?.workedMinutes,
  `${bSheet?.totalMinutes} min`,
);
// An empty sheet cannot be submitted, and payroll needs every sheet approved. Ada logs an hour on
// another day; her holiday still contributes nothing.
await t.a.as('POST', `/timesheets/${aSheet?.id}/entries`, {
  workDate: daysAgo(1) < PERIOD_START ? PERIOD_START : daysAgo(1),
  minutes: 60,
  description: 'Weekly sync',
});
for (const [who, employee, sheet] of [
  ['Ada', t.a, aSheet],
  ['Bea', t.b, bSheet],
]) {
  const submitted = await employee.as('POST', `/timesheets/${sheet?.id}/submit`, {});
  const approved = await t.org('POST', `/timesheets/${sheet?.id}/decision`, {
    status: 'APPROVED',
    comment: 'Matches attendance',
  });
  ok(
    `setup: ${who}’s timesheet is submitted and approved`,
    good(submitted) && good(approved),
    `${status(submitted)} / ${status(approved)}`,
  );
}
const aSheetAfter = await sheetOf(t.a);
ok(
  'Ada’s sheet totals only the logged hour',
  aSheetAfter?.totalMinutes === 60,
  `${aSheetAfter?.totalMinutes} min`,
);

const recalc = await t.org('POST', `/payroll/runs/${run.payload?.id}/calculate`, {});
ok('the run recalculates', good(recalc), status(recalc));
ok('and is no longer stale', !(await runState())?.calculationStaleAt);
const grossAfter = { a: await gross(t.a.id), b: await gross(t.b.id) };
ok(
  'Ada’s pay is unchanged by the kept holiday',
  Math.abs(grossAfter.a - grossBefore.a) < 0.005,
  `${grossBefore.a} → ${grossAfter.a}`,
);
// Only overtime reaches pay: 60,000 / (480 × 30) × overtime minutes × 1.5. No holiday premium.
const expectedB = (60000 / (480 * 30)) * (convertedDay?.overtimeMinutes ?? 0) * 1.5;
ok(
  'Bea’s pay moves only by the overtime of the recorded minutes — no holiday premium',
  Math.abs(grossAfter.b - grossBefore.b - Math.round(expectedB * 100) / 100) < 0.011,
  `${grossBefore.b} → ${grossAfter.b}, overtime ${convertedDay?.overtimeMinutes} min`,
);
await db.end();

finish();
