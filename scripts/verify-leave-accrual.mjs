#!/usr/bin/env node
/**
 * Leave accrual — against the running API.
 *
 * Balances used to be filled once, on the day they were opened: a mid-year joiner got the whole
 * year's allowance and a monthly type never grew. This drives the rules end to end: pro-rating a
 * fixed allowance by joining month, monthly accrual up to the current month, turning pro-rating
 * off, and editing a type without touching its code — and who may do that.
 *
 *   pnpm verify:leave-accrual
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';
import { testAadhaar } from './lib/aadhaar.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('la');
const org = t.org;
const month = new Date().getUTCMonth() + 1; // the harness organization's leave year starts in January

console.log('setup');
const joiner = await org('POST', '/employees', {
  employeeNumber: 'EMP-J',
  firstName: 'Jo',
  lastName: 'Joiner',
  workEmail: `jo.${Date.now()}@t.test`,
  aadhaarNumber: testAadhaar(),
  employmentType: 'FULL_TIME',
  dateOfJoining: `${new Date().getUTCFullYear()}-07-10`,
});
ok('a mid-year joiner is hired in July', good(joiner), status(joiner));
const posted = await org('POST', `/employees/${joiner.payload?.id}/branches`, {
  branchId: t.branchId,
  isPrimary: true,
  startsOn: `${new Date().getUTCFullYear()}-07-10`,
});
ok('and posted to the branch', good(posted), status(posted));

const createType = (body) =>
  org('POST', '/leave/types', { paid: true, requiresAttachment: false, ...body });
const fixed = await createType({
  code: 'PRO',
  name: 'Pro-rated',
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: 12,
});
const flat = await createType({
  code: 'FLAT',
  name: 'Not pro-rated',
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: 12,
  prorateForJoiners: false,
});
const monthly = await createType({
  code: 'MON',
  name: 'Monthly',
  accrualType: 'MONTHLY',
  monthlyAccrual: 1.5,
});
ok(
  'three types are created',
  [fixed, flat, monthly].every(good),
  [fixed, flat, monthly].map(status).join(', '),
);
ok(
  'pro-rating is on unless turned off',
  fixed.payload?.prorateForJoiners === true && flat.payload?.prorateForJoiners === false,
);
for (const code of ['PRO', 'FLAT', 'MON'])
  await org('POST', `/leave/types/${code}/assign`, { branchId: t.branchId });

const balanceOf = async (employeeId, typeId) =>
  rows((await org('GET', `/leave/balances?employeeId=${employeeId}`)).payload).find(
    (balance) => balance.leaveTypeId === typeId,
  );

console.log('\nfixed allowance');
const adaFixed = await balanceOf(t.a.id, fixed.payload?.id);
ok(
  'someone here all year has the full 12',
  Number(adaFixed?.availableAmount) === 12,
  adaFixed?.availableAmount,
);
const joFixed = await balanceOf(joiner.payload?.id, fixed.payload?.id);
ok(
  'a July joiner has the six months left: 6',
  Number(joFixed?.availableAmount) === 6,
  joFixed?.availableAmount,
);
const joFlat = await balanceOf(joiner.payload?.id, flat.payload?.id);
ok(
  'with pro-rating off they have all 12',
  Number(joFlat?.availableAmount) === 12,
  joFlat?.availableAmount,
);

console.log('\nmonthly accrual');
const adaMonthly = await balanceOf(t.a.id, monthly.payload?.id);
ok(
  `a January starter has ${month} months of 1.5`,
  Number(adaMonthly?.availableAmount) === month * 1.5,
  adaMonthly?.availableAmount,
);
const joMonthly = await balanceOf(joiner.payload?.id, monthly.payload?.id);
const joMonths = Math.max(0, month - 6);
ok(
  `the July joiner has ${joMonths} months of it`,
  Number(joMonthly?.availableAmount) === joMonths * 1.5,
  joMonthly?.availableAmount,
);

console.log('\nediting a type');
const edited = await org('PATCH', `/leave/types/${fixed.payload?.id}`, {
  name: 'Earned Leave',
  paid: true,
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: 15,
  carryoverLimit: 5,
  requiresAttachment: false,
});
ok('an administrator edits it', good(edited), status(edited));
ok('the code does not change', edited.payload?.code === 'PRO', edited.payload?.code);
ok(
  'the new rules are saved',
  Number(edited.payload?.annualAllowance) === 15 && Number(edited.payload?.carryoverLimit) === 5,
);
const byEmployee = await t.a.as('PATCH', `/leave/types/${fixed.payload?.id}`, {
  name: 'Mine now',
  paid: true,
  accrualType: 'FIXED_ANNUAL',
  requiresAttachment: false,
});
ok('an employee cannot', refused(byEmployee), status(byEmployee));
const missing = await org('PATCH', `/leave/types/00000000-0000-4000-8000-000000000000`, {
  name: 'Ghost',
  paid: true,
  accrualType: 'NONE',
  requiresAttachment: false,
});
ok('an unknown type is not found', missing.status === 404, status(missing));

finish();
