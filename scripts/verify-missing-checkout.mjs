#!/usr/bin/env node
/**
 * A forgotten check-out, repaired through a correction — against the running API.
 *
 * The reported case: check-in 09:12, no check-out. The day counted no worked time, and the
 * correction workflow could not add a check-out. This drives the whole path with real sessions:
 *
 *   check-in 09:12 (IST) → the employee asks for an 18:07 check-out → a manager approves →
 *   the same record now has an 18:07 check-out and 535 minutes → the calculated payroll run is
 *   stale → the period's timesheet is re-derived and approved → the recalculated run pays exactly
 *   the overtime those 535 minutes carry (55 over the 480-minute standard day).
 *
 * Also: colleagues and other tenants are refused, bad times are refused, a rejected correction
 * changes nothing, and nothing is decided twice. Nothing closes a day automatically.
 *
 *   pnpm verify:missing-checkout
 */
import { createRequire } from 'node:module';
import { weekdaysAgo } from './lib/dates.mjs';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));

const DAY = weekdaysAgo(2);
const CHECK_IN = `${DAY}T03:42:00.000Z`; // 09:12 in Asia/Kolkata
const CHECK_OUT = `${DAY}T18:07:00+05:30`;
const CHECK_OUT_UTC = new Date(CHECK_OUT).toISOString();

const t = await tenant('mc');
const other = await tenant('mx');
const periodStart = DAY < t.monthStart ? DAY.slice(0, 8) + '01' : t.monthStart;

// A salaried employee with overtime pay, so the corrected minutes have something to reach.
const profile = await t.org('POST', '/payroll/profile', {
  employeeId: t.a.id,
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
ok('setup: a salaried payroll profile', good(profile), status(profile));

const day = async () =>
  rows((await t.org('GET', `/attendance?employeeId=${t.a.id}&from=${DAY}&to=${DAY}`)).payload);

console.log('a day with a check-in and no check-out');
const punched = await t.org('POST', '/attendance/check-ins', {
  employeeId: t.a.id,
  occurredAt: CHECK_IN,
  workDate: DAY,
  branchId: t.branchId,
});
ok('setup: the 09:12 check-in is recorded', good(punched), status(punched));
const [record] = await day();
ok(
  'the day counts no worked time while it is open',
  record?.workedMinutes === 0,
  String(record?.workedMinutes),
);

const run = await t.org('POST', '/payroll/runs', {
  periodStart,
  periodEnd: t.today,
  payFrequency: 'MONTHLY',
});
const firstCalc = await t.org('POST', `/payroll/runs/${run.payload?.id}/calculate`, {});
ok('setup: a payroll run is calculated before the correction', good(firstCalc), status(firstCalc));
const runState = async () =>
  rows((await t.org('GET', '/payroll/runs')).payload).find((r) => r.id === run.payload?.id);

const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
const gross = async () =>
  Number(
    (
      await db.query(
        'SELECT gross_amount FROM payroll_line_items WHERE payroll_run_id = $1 AND employee_id = $2',
        [run.payload?.id, t.a.id],
      )
    ).rows[0]?.gross_amount,
  );
const grossBefore = await gross();

console.log('\nwho may ask, and for what');
const path = `/attendance/${record?.id}/corrections/missing-check-out`;
const colleague = await t.b.as('POST', path, {
  checkOutAt: CHECK_OUT,
  reason: 'Filing for a colleague',
});
ok(
  "a colleague cannot request a check-out on someone else's day",
  refused(colleague),
  status(colleague),
);
const foreign = await other.org('POST', path, { checkOutAt: CHECK_OUT, reason: 'Another tenant' });
ok('another tenant cannot reach the record', refused(foreign), status(foreign));
const early = await t.a.as('POST', path, {
  checkOutAt: `${DAY}T08:00:00+05:30`,
  reason: 'Forgot to punch out',
});
ok('a check-out before the check-in is refused', early.status === 409, status(early));
const noReason = await t.a.as('POST', path, { checkOutAt: CHECK_OUT, reason: 'no' });
ok('a missing or too-short reason is refused', noReason.status === 400, status(noReason));
const noOffset = await t.a.as('POST', path, {
  checkOutAt: `${DAY}T18:07:00`,
  reason: 'Forgot to punch out',
});
ok('a time without a time zone is refused', noOffset.status === 400, status(noOffset));

console.log('\nrequest, rejection, request again');
const first = await t.a.as('POST', path, { checkOutAt: CHECK_OUT, reason: 'Forgot to punch out' });
ok('the employee requests the 18:07 check-out', good(first), status(first));
const duplicate = await t.a.as('POST', path, {
  checkOutAt: CHECK_OUT,
  reason: 'Forgot to punch out',
});
ok('a second request while one is pending is refused', duplicate.status === 409, status(duplicate));
const [pendingDay] = await day();
ok(
  'nothing changes before a decision',
  pendingDay?.workedMinutes === 0,
  String(pendingDay?.workedMinutes),
);

const rejected = await t.org('POST', `/attendance/${first.payload?.id}/decision`, {
  status: 'REJECTED',
  comment: 'Please confirm the time with your lead first',
});
ok('the manager can reject it', good(rejected), status(rejected));
const [afterReject] = await day();
ok(
  'a rejection leaves the day open and unchanged',
  afterReject?.workedMinutes === 0 && (afterReject?.punches ?? []).length === 1,
  `${afterReject?.workedMinutes} min, ${(afterReject?.punches ?? []).length} punch(es)`,
);
const staleAfterReject = await runState();
ok(
  'and does not touch payroll',
  !staleAfterReject?.calculationStaleAt,
  String(staleAfterReject?.calculationStaleAt),
);

const second = await t.a.as('POST', path, { checkOutAt: CHECK_OUT, reason: 'Forgot to punch out' });
ok('the employee asks again', good(second), status(second));
const inbox = rows((await t.org('GET', '/attendance/corrections/inbox')).payload).find(
  (c) => c.id === second.payload?.id,
);
ok(
  'the approver sees the requested time',
  inbox?.afterSnapshot?.missingCheckOut?.occurredAt === CHECK_OUT_UTC,
  String(inbox?.afterSnapshot?.missingCheckOut?.occurredAt),
);

console.log('\napproval');
const approved = await t.org('POST', `/attendance/${second.payload?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Confirmed with the team lead',
});
ok('the manager approves', good(approved), status(approved));
const days = await day();
const corrected = days[0];
const outPunch = (corrected?.punches ?? []).find((p) => p.punchType === 'OUT');
ok(
  'it is the same record, not a second one',
  days.length === 1 && corrected?.id === record?.id,
  `${days.length} record(s)`,
);
ok(
  'the 18:07 check-out is on it',
  outPunch && new Date(outPunch.occurredAt).toISOString() === CHECK_OUT_UTC,
  String(outPunch?.occurredAt),
);
ok('worked minutes are 535', corrected?.workedMinutes === 535, String(corrected?.workedMinutes));
ok(
  'of which 55 are overtime',
  corrected?.overtimeMinutes === 55,
  String(corrected?.overtimeMinutes),
);
const twice = await t.org('POST', `/attendance/${second.payload?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approving again',
});
ok('it cannot be approved twice', twice.status === 409, status(twice));
const [stillOne] = await day();
ok(
  'and still has exactly one check-out',
  (stillOne?.punches ?? []).filter((p) => p.punchType === 'OUT').length === 1,
);

console.log('\npayroll and timesheets');
const stale = await runState();
ok(
  'the calculated run is now stale',
  Boolean(stale?.calculationStaleAt),
  String(stale?.calculationStaleAt),
);

const period = await t.org('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart,
  periodEnd: t.today,
});
await t.org('POST', `/timesheets/periods/${period.payload?.id}/derive`, {});
const sheet = rows((await t.org('GET', `/timesheets?employeeId=${t.a.id}`)).payload).find(
  (s) => s.periodId === period.payload?.id,
);
const entry = (sheet?.entries ?? []).find((e) => String(e.workDate).slice(0, 10) === DAY);
ok(
  'the derived timesheet carries the corrected 535 minutes',
  entry?.minutes === 535,
  String(entry?.minutes),
);
// Payroll consumes only a period whose every timesheet is approved, and an empty sheet cannot be
// submitted. The colleague logs an hour so their sheet can be approved too; only A's pay is asserted.
const colleagueSheet = rows((await t.org('GET', `/timesheets?employeeId=${t.b.id}`)).payload).find(
  (s) => s.periodId === period.payload?.id,
);
await t.b.as('POST', `/timesheets/${colleagueSheet?.id}/entries`, {
  workDate: DAY,
  minutes: 60,
  description: 'Weekly sync',
});
await t.b.as('POST', `/timesheets/${colleagueSheet?.id}/submit`, {});
const colleagueApproved = await t.org('POST', `/timesheets/${colleagueSheet?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approved',
});
ok(
  "setup: the colleague's timesheet is approved",
  good(colleagueApproved),
  status(colleagueApproved),
);
const submitted = await t.a.as('POST', `/timesheets/${sheet?.id}/submit`, {});
const sheetApproved = await t.org('POST', `/timesheets/${sheet?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Hours match attendance',
});
ok(
  'setup: the timesheet is submitted and approved',
  good(submitted) && good(sheetApproved),
  `${status(submitted)} / ${status(sheetApproved)}`,
);

const recalc = await t.org('POST', `/payroll/runs/${run.payload?.id}/calculate`, {});
ok('the run recalculates', good(recalc), status(recalc));
const cleared = await runState();
ok('and is no longer stale', !cleared?.calculationStaleAt, String(cleared?.calculationStaleAt));
// 60,000 / (480 × 30) × 55 overtime minutes × 1.5 = 343.75
const grossAfter = await gross();
ok(
  'the recalculated pay includes exactly the overtime of those 535 minutes (+343.75)',
  Math.abs(grossAfter - grossBefore - 343.75) < 0.005,
  `${grossBefore} → ${grossAfter}`,
);
await db.end();

finish();
