#!/usr/bin/env node
/**
 * The HR features added together — against the running API.
 *
 *   leave:      the sandwich rule, comp-off for a worked weekend, leave encashment
 *   attendance: late-mark rules and the late report
 *   shifts:     a rotating roster
 *   employees:  the organization's own fields, probation and confirmation
 *   payroll:    statutory returns, the bank file and the annual statement — who may see them
 *   reports:    headcount, attendance, leave and project hours — who may see them
 *
 *   pnpm verify:hr-extras
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('hx');
const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const next = (weekday, after) => {
  const d = new Date(after);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};
const type = (code, extra) =>
  t
    .org('POST', '/leave/types', {
      code,
      name: code,
      paid: true,
      accrualType: 'FIXED_ANNUAL',
      annualAllowance: 20,
      requiresAttachment: false,
      ...extra,
    })
    .then(async (r) => {
      await t.org('POST', `/leave/types/${code}/assign`, { branchId: t.branchId });
      return r.payload;
    });

console.log('the sandwich rule');
const sandwich = await type('SAND', { sandwichOffDays: true });
const plain = await type('PLAIN');
ok('a type can count enclosed off-days', sandwich?.sandwichOffDays === true);
const friday = next(5, Date.now() + 3 * DAY);
const monday = new Date(friday.getTime() + 3 * DAY);
const withRule = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: sandwich?.id,
  startDate: iso(friday),
  endDate: iso(monday),
});
ok(
  'Friday to Monday counts the weekend: 4 days',
  Number(withRule.payload?.requestedDays) === 4,
  withRule.payload?.requestedDays ?? status(withRule),
);
const friday2 = new Date(friday.getTime() + 7 * DAY);
const withoutRule = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: plain?.id,
  startDate: iso(friday2),
  endDate: iso(new Date(friday2.getTime() + 3 * DAY)),
});
ok(
  'without the rule it is 2 days',
  Number(withoutRule.payload?.requestedDays) === 2,
  withoutRule.payload?.requestedDays ?? status(withoutRule),
);

console.log('\ncomp-off');
const noType = await t.a.as('POST', '/leave/comp-offs', {
  workDate: iso(new Date()),
  days: 1,
  reason: 'Release',
});
ok('without a comp-off type it says so', noType.status === 409, status(noType));
await t.org('POST', '/leave/types', {
  code: 'COMP',
  name: 'Comp off',
  paid: true,
  accrualType: 'MANUAL',
  isCompOff: true,
  compOffExpiryDays: 30,
  requiresAttachment: false,
});
await t.org('POST', '/leave/types/COMP/assign', { branchId: t.branchId });
const saturday = next(6, Date.now() - 8 * DAY);
for (const [path, hour] of [
  ['/attendance/check-ins', '09'],
  ['/attendance/check-outs', '15'],
])
  await t.org('POST', path, {
    employeeId: t.a.id,
    occurredAt: `${iso(saturday)}T${hour}:00:00.000Z`,
    workDate: iso(saturday),
    branchId: t.branchId,
  });
const weekday = next(3, Date.now() - 8 * DAY);
const onWorkday = await t.a.as('POST', '/leave/comp-offs', {
  workDate: iso(weekday),
  days: 1,
  reason: 'Release',
});
ok('a working day does not earn comp-off', onWorkday.status === 409, status(onWorkday));
const asked = await t.a.as('POST', '/leave/comp-offs', {
  workDate: iso(saturday),
  days: 1,
  reason: 'Weekend release support',
});
ok('a worked Saturday earns a request', good(asked), status(asked));
const twice = await t.a.as('POST', '/leave/comp-offs', {
  workDate: iso(saturday),
  days: 1,
  reason: 'Again',
});
ok('the same day cannot be asked for twice', twice.status === 409, status(twice));
const selfDecide = await t.a.as('POST', `/leave/comp-offs/${asked.payload?.id}/decision`, {
  approve: true,
});
ok('nobody approves their own', refused(selfDecide), status(selfDecide));
const approved = await t.org('POST', `/leave/comp-offs/${asked.payload?.id}/decision`, {
  approve: true,
});
ok('HR approves it', good(approved), status(approved));
const compBalance = rows((await t.org('GET', `/leave/balances?employeeId=${t.a.id}`)).payload).find(
  (b) =>
    b.leaveType?.code === 'COMP' || b.leaveTypeCode === 'COMP' || Number(b.availableAmount) === 1,
);
ok(
  'a day is credited to comp-off',
  Boolean(compBalance),
  JSON.stringify(compBalance?.availableAmount),
);

console.log('\nencashment');
const encash = await type('ENC', { encashable: true, maxEncashDays: 5 });
const notAllowed = await t.a.as('POST', '/leave/encashments', { leaveTypeId: plain?.id, days: 1 });
ok('a type that is not encashable refuses', notAllowed.status === 409, status(notAllowed));
const tooMany = await t.a.as('POST', '/leave/encashments', { leaveTypeId: encash?.id, days: 6 });
ok('more than the yearly limit refuses', tooMany.status === 409, status(tooMany));
const encashment = await t.a.as('POST', '/leave/encashments', { leaveTypeId: encash?.id, days: 3 });
ok('3 days are asked to be encashed', good(encashment), status(encashment));
const noSalary = await t.org('POST', `/leave/encashments/${encashment.payload?.id}/decision`, {
  approve: true,
});
ok('it cannot be paid without a salary', noSalary.status === 409, status(noSalary));
const salary = await t.org('POST', '/payroll/profile', {
  employeeId: t.a.id,
  grossSalary: 30000,
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
ok('setup: Ada has a salary', good(salary), status(salary));
const paid = await t.org('POST', `/leave/encashments/${encashment.payload?.id}/decision`, {
  approve: true,
});
ok(
  'approved at a day’s pay: 30,000 / 30 × 3 = 3,000',
  paid.payload?.amount === 3000,
  status(paid) + ' ' + paid.payload?.amount,
);

console.log('\nlate marks');
const rules = await t.org('PUT', '/attendance/late/rules', {
  graceMinutes: 10,
  marksPerHalfDay: 3,
});
ok('HR sets the late rule', good(rules) && rules.payload?.marksPerHalfDay === 3, status(rules));
const byEmployee = await t.a.as('PUT', '/attendance/late/rules', {
  graceMinutes: 0,
  marksPerHalfDay: 1,
});
ok('an employee cannot', refused(byEmployee), status(byEmployee));
const marks = await t.a.as('GET', `/attendance/late?from=${t.monthStart}&to=${t.today}`);
ok(
  'an employee sees their own late marks',
  good(marks) && marks.payload?.rule?.graceMinutes === 10,
  status(marks),
);

console.log('\nrotating roster');
const shift = (name, startsAt, endsAt) =>
  t.org('POST', '/shifts', {
    code: name.slice(0, 3).toUpperCase() + Date.now().toString(36).slice(-4),
    name,
    daysOfWeek: [1, 2, 3, 4, 5],
    startsAt,
    endsAt,
    crossesMidnight: false,
    breakMinutes: 30,
  });
const morning = (await shift('Morning', '06:00', '14:00')).payload;
const evening = (await shift('Evening', '14:00', '22:00')).payload;
const plan = await t.org('POST', '/shifts/rotations', {
  employeeIds: [t.a.id, t.b.id],
  shiftIds: [morning?.id, evening?.id],
  weeksPerShift: 2,
  startsOn: iso(next(1, Date.now() + 14 * DAY)),
  totalWeeks: 8,
  stagger: true,
});
ok('two people are planned for 8 weeks', plan.payload?.planned === 2, status(plan));
ok(
  'in four stretches each',
  plan.payload?.results?.every((r) => r.planned === 4),
);

console.log('\nthe organization’s own fields');
const size = await t.org('POST', '/custom-fields', {
  label: 'T-shirt size',
  fieldType: 'SELECT',
  options: ['S', 'M', 'L'],
  employeeEditable: true,
});
const vehicle = await t.org('POST', '/custom-fields', {
  label: 'Vehicle number',
  fieldType: 'TEXT',
});
ok('HR adds two fields', good(size) && good(vehicle));
ok('the key is made from the name', size.payload?.key === 't_shirt_size', size.payload?.key);
const bad = await t.a.as('PUT', `/employees/${t.a.id}/custom-fields`, {
  values: { t_shirt_size: 'XXL' },
});
ok('a value outside the choices is refused', bad.status === 409, status(bad));
const mine = await t.a.as('PUT', `/employees/${t.a.id}/custom-fields`, {
  values: { t_shirt_size: 'M' },
});
ok('Ada sets her own size', good(mine), status(mine));
const hrOnly = await t.a.as('PUT', `/employees/${t.a.id}/custom-fields`, {
  values: { vehicle_number: 'KA01' },
});
ok('but not a field HR keeps', refused(hrOnly), status(hrOnly));
const seen = (await t.a.as('GET', `/employees/${t.a.id}/custom-fields`)).payload ?? [];
ok(
  'she sees only her own fields',
  seen.length === 1 && seen[0]?.value === 'M',
  JSON.stringify(seen.map((f) => f.key)),
);
const others = await t.b.as('GET', `/employees/${t.a.id}/custom-fields`);
ok("Bea cannot read Ada's", refused(others), status(others));

console.log('\nprobation');
const probation = await t.org('PUT', `/employees/${t.b.id}/probation`, {
  endsOn: iso(new Date(Date.now() + 5 * DAY)),
});
ok('Bea is on probation', good(probation), status(probation));
const due = rows((await t.org('GET', '/probation')).payload);
ok(
  'she is on the list, ending in 5 days',
  due.some((p) => p.employeeId === t.b.id && p.daysLeft === 5),
);
const shorter = await t.org('POST', `/employees/${t.b.id}/confirmation`, {
  extendTo: iso(new Date()),
});
ok('an extension must be later', shorter.status === 409, status(shorter));
const confirmed = await t.org('POST', `/employees/${t.b.id}/confirmation`, { note: 'Well done' });
ok('she is confirmed', good(confirmed), status(confirmed));
ok(
  'and off the list',
  !rows((await t.org('GET', '/probation')).payload).some((p) => p.employeeId === t.b.id),
);

console.log('\npayroll reports');
const run = await t.org('POST', '/payroll/runs', { periodStart: t.monthStart, periodEnd: t.today });
const draft = await t.org('GET', `/payroll/runs/${run.payload?.id}/statutory?scheme=EPF`);
ok('statutory returns wait for a released run', draft.status === 409, status(draft));
const bankByEmployee = await t.a.as('GET', `/payroll/runs/${run.payload?.id}/bank-file`);
ok('an employee cannot export the bank file', refused(bankByEmployee), status(bankByEmployee));
const calculated = await t.org('POST', `/payroll/runs/${run.payload?.id}/calculate`);
ok('setup: the run is calculated', good(calculated), status(calculated));
const review = await t.org('GET', `/payroll/runs/${run.payload?.id}/review`);
const adaLine = review.payload?.items?.find((item) => item.employeeId === t.a.id);
ok(
  'the approved encashment is paid to Ada, not taken off her pay',
  adaLine?.breakdown?.additions === 3000 && adaLine?.breakdown?.otherDeductions === 0,
  JSON.stringify(adaLine?.breakdown ?? review.payload?.detail),
);
const year =
  new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
const own = await t.a.as('GET', `/payroll/employees/${t.a.id}/annual-statement?year=${year}`);
ok(
  'Ada reads her own annual statement',
  good(own) && Array.isArray(own.payload?.months),
  status(own),
);
const hers = await t.b.as('GET', `/payroll/employees/${t.a.id}/annual-statement?year=${year}`);
ok("Bea cannot read Ada's", refused(hers), status(hers));

console.log('\nreports');
const headcount = await t.org('GET', '/reports/headcount');
ok(
  'headcount counts everyone current',
  good(headcount) && headcount.payload?.current >= 2,
  status(headcount),
);
for (const report of ['attendance', 'leave', 'project-hours']) {
  const r = await t.org('GET', `/reports/${report}?from=${t.monthStart}&to=${t.today}`);
  ok(`the ${report} report runs`, good(r), status(r));
}
// Last month, when nobody here recorded any attendance: every working day was unaccounted for.
const lastMonthEnd = new Date(`${t.monthStart}T00:00:00Z`);
lastMonthEnd.setUTCDate(0);
const lastMonthStart = `${lastMonthEnd.toISOString().slice(0, 8)}01`;
const lastMonth = await t.org(
  'GET',
  `/reports/attendance?from=${lastMonthStart}&to=${lastMonthEnd.toISOString().slice(0, 10)}`,
);
const beaRow = lastMonth.payload?.rows?.find((row) => row.name.startsWith('Bea'));
ok(
  'working days with no attendance count as absences, as payroll counts them',
  good(lastMonth) && beaRow?.present === 0 && beaRow?.absent >= 15,
  JSON.stringify(beaRow ?? lastMonth.payload?.detail),
);
const denied = await t.a.as('GET', '/reports/headcount');
ok('an employee cannot see organization reports', refused(denied), status(denied));

finish();
