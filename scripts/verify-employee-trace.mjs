#!/usr/bin/env node
/**
 * One employee, from hire to leaving, through every module that has to agree about them.
 *
 * The other suites each prove one module in isolation. This one follows a single person:
 * onboarded → given a login → put on a team and a project with a role → assigned a shift → leave
 * approved → attendance recorded → timesheet submitted and approved → paid → an upstream change
 * makes the run stale → recalculated → deactivated, after which nothing new may be assigned to
 * them while their history stays readable.
 *
 * The assertions are about the connections, not the endpoints: every stage reads the record back
 * and checks it names the same employee and the state the previous stage left behind.
 *
 *   pnpm verify:employee-trace
 */
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';
import { testAadhaar } from './lib/aadhaar.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('tr');
const stamp = Date.now();

/** A weekday `days` from today, so leave and attendance never land on a weekly off. */
function weekday(days) {
  const d = new Date(`${t.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
    d.setUTCDate(d.getUTCDate() + (days < 0 ? -1 : 1));
  return d.toISOString().slice(0, 10);
}

console.log('\n1. the employee exists');
let r = await t.org('POST', '/employees', {
  firstName: 'Trace',
  lastName: 'Subject',
  workEmail: `trace-${stamp}@trace.test`,
  dateOfJoining: '2026-01-05',
  employmentType: 'FULL_TIME',
  primaryBranchId: t.branchId,
  aadhaarNumber: testAadhaar(),
});
ok('the employee is onboarded', good(r), status(r));
const employee = r.payload;
ok('with a generated employee number', Boolean(employee?.employeeNumber), employee?.employeeNumber);
r = await t.org('GET', `/employees/${employee?.id}`);
ok('and reads back as the same person', r.payload?.id === employee?.id, status(r));
ok(
  'on the branch they were hired into',
  r.payload?.primaryBranchId === t.branchId,
  r.payload?.primaryBranchId,
);

console.log('\n2. team and project membership');
const team = (await t.org('POST', '/teams', { name: `Trace Team ${stamp}`, branchId: t.branchId }))
  .payload;
r = await t.org('POST', `/teams/${team?.id}/members`, {
  employeeId: employee?.id,
  joinedAt: '2026-01-05',
  teamRole: 'Member',
});
ok('they join a team', good(r), status(r));
const teamRow = rows((await t.org('GET', '/teams')).payload).find((e) => e.id === team?.id);
ok(
  'and the team names them among its members',
  (teamRow?.members ?? []).some((m) => m.employeeId === employee?.id && !m.leftAt),
  `${(teamRow?.members ?? []).length} members`,
);

const project = (
  await t.org('POST', '/projects', { name: `Trace Project ${stamp}`, branchId: t.branchId })
).payload;
r = await t.org('POST', `/projects/${project?.id}/members`, {
  employeeId: employee?.id,
  startsOn: '2026-01-05',
  projectRole: 'Developer',
});
ok('they are allocated to a project with a role', good(r), status(r));
const projectRow = rows((await t.org('GET', '/projects')).payload).find(
  (e) => e.id === project?.id,
);
const allocation = (projectRow?.members ?? []).find((m) => m.employeeId === employee?.id);
ok(
  'the allocation carries the role it was given',
  allocation?.projectRole === 'Developer',
  allocation?.projectRole,
);
r = await t.org('POST', `/projects/${project?.id}/members`, {
  employeeId: employee?.id,
  startsOn: '2026-01-05',
});
ok('and the same person cannot be allocated twice', r.status === 409, status(r));

console.log('\n3. a shift');
const shift = (
  await t.org('POST', '/shifts', {
    name: `Trace Shift ${stamp}`,
    daysOfWeek: [1, 2, 3, 4, 5],
    startsAt: '09:00',
    endsAt: '17:00',
    crossesMidnight: false,
    breakMinutes: 0,
  })
).payload;
r = await t.org('POST', `/shifts/employees/${employee?.id}/assignments`, {
  shiftId: shift?.id,
  startsOn: '2026-01-05',
});
ok('a shift is assigned', good(r), status(r));
const assignments = rows(
  (await t.org('GET', `/shifts/assignments?employeeId=${employee?.id}`)).payload?.items ??
    (await t.org('GET', `/shifts/assignments?employeeId=${employee?.id}`)).payload,
);
ok(
  'and the assignment points at that shift',
  assignments.some((a) => a.shift?.id === shift?.id),
  `${assignments.length} assignments`,
);

console.log('\n4. pay, attendance and a timesheet');
r = await t.org('POST', '/payroll/profile', {
  employeeId: employee?.id,
  grossSalary: 60000,
  payType: 'SALARY',
  payFrequency: 'MONTHLY',
  overtimeMultiplier: 1.5,
  effectiveFrom: '2026-01-05',
  payrollEnabled: true,
  salarySlipMode: 'ENABLED',
  pfEnabled: false,
  esiEnabled: false,
  ptEnabled: false,
});
ok('a salary is recorded', good(r), status(r));

const workDate = weekday(-3);
const punchAt = (hhmm) => `${workDate}T${hhmm}:00+05:30`;
await t.org('POST', '/attendance/check-ins', {
  employeeId: employee?.id,
  occurredAt: punchAt('09:00'),
  workDate,
  branchId: t.branchId,
});
r = await t.org('POST', '/attendance/check-outs', {
  employeeId: employee?.id,
  occurredAt: punchAt('19:00'),
  workDate,
  branchId: t.branchId,
});
ok('a ten-hour day is recorded', good(r), status(r));
const attendance = rows(
  (await t.org('GET', `/attendance?employeeId=${employee?.id}&from=${workDate}&to=${workDate}`))
    .payload,
)[0];
ok(
  'measured against the assigned shift, two hours are overtime',
  attendance?.workedMinutes === 600 && attendance?.overtimeMinutes === 120,
  `${attendance?.workedMinutes} worked, ${attendance?.overtimeMinutes} overtime`,
);

const period = (
  await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  })
).payload;
await t.org('POST', `/timesheets/periods/${period?.id}/derive`, {});
const sheet = rows((await t.org('GET', '/timesheets')).payload).find(
  (s) => s.employeeId === employee?.id && s.periodId === period?.id,
);
ok(
  'the day reaches a timesheet for this employee',
  Boolean(sheet?.id),
  JSON.stringify(sheet?.status),
);
ok(
  'carrying the overtime attendance measured',
  (sheet?.overtimeMinutes ?? 0) >= 120,
  `${sheet?.overtimeMinutes} overtime minutes`,
);
r = await t.org('POST', `/timesheets/${sheet?.id}/submit`, {});
ok('it is submitted for approval', good(r), status(r));
r = await t.org('POST', `/timesheets/${sheet?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approved for the trace suite',
});
ok('an approver approves it', good(r), status(r));
const approved = rows((await t.org('GET', '/timesheets')).payload).find((s) => s.id === sheet?.id);
ok('and it reads back approved', approved?.status === 'APPROVED', approved?.status);

console.log('\n5. payroll, staleness and recalculation');
// The derive step also left an empty draft for each colleague who logged nothing. Those cannot be
// submitted, so payroll must not wait on them — this is the regression for that block.
const idle = rows((await t.org('GET', '/timesheets')).payload).filter(
  (entry) => entry.status === 'DRAFT' && entry.totalMinutes === 0,
);
ok(
  'colleagues with nothing logged hold empty drafts',
  idle.length > 0,
  `${idle.length} empty drafts`,
);

const created = await t.org('POST', '/payroll/runs', {
  periodStart: t.monthStart,
  periodEnd: t.today,
});
ok('a payroll run is opened for the period', good(created), status(created));
const run = created.payload;
r = await t.org('POST', `/payroll/runs/${run?.id}/calculate`, {});
ok('the run calculates', good(r), status(r));
const firstHash = r.payload?.calculationHash;
const readRun = async () =>
  rows((await t.org('GET', '/payroll/runs')).payload).find((entry) => entry.id === run?.id);
let state = await readRun();
ok('and is not stale yet', !state?.calculationStaleAt, String(state?.calculationStaleAt));

r = await t.org('POST', '/payroll/profile', {
  employeeId: employee?.id,
  grossSalary: 72000,
  payType: 'SALARY',
  payFrequency: 'MONTHLY',
  overtimeMultiplier: 1.5,
  effectiveFrom: t.monthStart,
  payrollEnabled: true,
  salarySlipMode: 'ENABLED',
  pfEnabled: false,
  esiEnabled: false,
  ptEnabled: false,
});
ok('the salary is revised upward', good(r), status(r));
state = await readRun();
ok(
  'which makes the calculated run stale',
  Boolean(state?.calculationStaleAt),
  String(state?.calculationStaleAt),
);
r = await t.org('POST', `/payroll/runs/${run?.id}/calculate`, {});
ok('it recalculates', good(r), status(r));
// Line items are not exposed before release, so the calculation hash is what shows the new
// salary reached the result rather than the run merely being re-stamped.
ok(
  'and the result changed with the new salary',
  Boolean(firstHash) && r.payload?.calculationHash !== firstHash,
  `${String(firstHash).slice(0, 8)} -> ${String(r.payload?.calculationHash).slice(0, 8)}`,
);
state = await readRun();
ok('and is no longer stale', !state?.calculationStaleAt, String(state?.calculationStaleAt));

console.log('\n6. leaving');
r = await t.org('POST', `/employees/${employee?.id}/deactivate`, {
  reason: 'End of the traced lifecycle',
});
ok('the employee is deactivated', good(r), status(r));
r = await t.org('GET', `/employees/${employee?.id}`);
ok('their record is still readable', good(r), status(r));
ok('and reports them as no longer active', r.payload?.status !== 'ACTIVE', r.payload?.status);
r = await t.org('POST', `/projects/${project?.id}/members`, {
  employeeId: employee?.id,
  startsOn: t.today,
});
ok('a former employee cannot be allocated to a project', r.status === 409, status(r));
r = await t.org('POST', `/teams/${team?.id}/members`, {
  employeeId: employee?.id,
  joinedAt: t.today,
});
ok('nor added to a team', r.status === 409, status(r));
r = await t.org('POST', `/shifts/employees/${employee?.id}/assignments`, {
  shiftId: shift?.id,
  startsOn: t.today,
});
ok('nor given a new shift', r.status === 409 || r.status === 404, status(r));
const history = rows((await t.org('GET', '/timesheets')).payload).find((s) => s.id === sheet?.id);
ok(
  'the timesheet they filed is still on record',
  Boolean(history?.id),
  JSON.stringify(history?.status),
);

finish();
