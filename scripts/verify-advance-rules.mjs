#!/usr/bin/env node
/**
 * Salary advances within the organization's limit.
 *
 * An administrator sets the most anyone may ask for or owe, as a percentage of monthly gross
 * salary, and how many months an approved advance is repaid over. Checked end to end:
 *
 *  - the employee is told how much they may still ask for, and why;
 *  - a request over what is left is refused with the figures, and one within it goes through;
 *  - what is waiting or still owed counts, so two requests cannot add up to more than the limit;
 *  - someone with no salary on record cannot ask, and a limit of 0 turns advances off;
 *  - only someone who manages payroll policy may change the rules;
 *  - repayment over several months takes an equal share from each run, not the lot at once.
 *
 *   pnpm verify:advance-rules
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const t = await tenant('ar', { defaultPolicies: false });
const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const ask = (who, amount) =>
  who.as('POST', '/payroll/advances', {
    employeeId: who.id,
    requestedAmount: amount,
    reason: 'Rent due before payday',
  });

console.log('\nno salary, no advance');
{
  const r = await ask(t.a, 1000);
  ok('someone with no salary on record is told to ask HR', r.status === 409, status(r));
}

// Ada earns 40,000 a month; the default limit is half of it.
const pay = await t.org('POST', '/employees/' + t.a.id + '/compensation', {
  payType: 'SALARY',
  payFrequency: 'MONTHLY',
  baseAmount: 40000,
  currencyCode: 'INR',
  overtimeMultiplier: 1.5,
  effectiveFrom: t.monthStart,
});
ok('setup: Ada has a salary', good(pay), status(pay));

console.log('\nthe limit');
{
  const rules = await t.a.as('GET', '/payroll/advance-rules');
  ok(
    'a new organization allows half a month and repays in one',
    rules.payload?.limitPercent === 50 && rules.payload?.recoveryMonths === 1,
    JSON.stringify(rules.payload),
  );
  let allowance = await t.a.as('GET', '/payroll/advances/allowance');
  ok(
    'the employee sees 20,000 available of a 40,000 salary',
    allowance.payload?.limit === 20000 && allowance.payload?.available === 20000,
    JSON.stringify(allowance.payload),
  );

  const over = await ask(t.a, 25000);
  ok(
    'a request over the limit is refused, with the figures',
    over.status === 409 && /20,000\.00/.test(over.payload?.detail ?? ''),
    status(over),
  );
  const first = await ask(t.a, 12000);
  ok('a request within the limit goes through', good(first), status(first));

  allowance = await t.a.as('GET', '/payroll/advances/allowance');
  ok(
    'what is waiting counts against the limit',
    allowance.payload?.outstanding === 12000 && allowance.payload?.available === 8000,
    JSON.stringify(allowance.payload),
  );
  const second = await ask(t.a, 9000);
  ok(
    'a second request cannot take the total past the limit',
    second.status === 409,
    status(second),
  );
  const fits = await ask(t.a, 8000);
  ok('one that fits what is left goes through', good(fits), status(fits));

  const colleague = await t.a.as('GET', '/payroll/advances/allowance?employeeId=' + t.b.id);
  ok("an employee cannot read a colleague's allowance", colleague.status >= 400, status(colleague));
  const adminView = await t.org('GET', '/payroll/advances/allowance?employeeId=' + t.a.id);
  ok(
    "payroll can read anyone's allowance",
    adminView.payload?.available === 0,
    JSON.stringify(adminView.payload),
  );

  // Clears Ada's requests so the rest starts from nothing owed.
  for (const advance of rows(
    (await t.org('GET', '/payroll/advances?employeeId=' + t.a.id)).payload,
  ))
    await t.org('POST', '/payroll/advances/' + advance.id + '/decision', {
      status: 'REJECTED',
      comment: 'Clearing for the next check',
    });
}

console.log('\nthe administrator sets the rules');
{
  const byEmployee = await t.a.as('PUT', '/payroll/advance-rules', {
    limitPercent: 100,
    recoveryMonths: 1,
  });
  ok('an employee cannot change the rules', refused(byEmployee), status(byEmployee));

  const tighter = await t.org('PUT', '/payroll/advance-rules', {
    limitPercent: 10,
    recoveryMonths: 1,
  });
  ok('the administrator can lower the limit', good(tighter), status(tighter));
  const r = await ask(t.a, 5000);
  ok('the lower limit applies at once (10% of 40,000 is 4,000)', r.status === 409, status(r));

  const invalid = await t.org('PUT', '/payroll/advance-rules', {
    limitPercent: 150,
    recoveryMonths: 0,
  });
  ok(
    'a limit over 100% or no repayment months is refused',
    invalid.status === 400,
    status(invalid),
  );

  await t.org('PUT', '/payroll/advance-rules', { limitPercent: 0, recoveryMonths: 1 });
  const off = await ask(t.a, 100);
  ok(
    'a limit of 0 turns advances off',
    off.status === 409 && /turned off/.test(off.payload?.detail ?? ''),
    status(off),
  );
}

console.log('\nrepayment over months');
{
  await t.org('PUT', '/payroll/advance-rules', { limitPercent: 50, recoveryMonths: 4 });
  const advance = await ask(t.a, 8000);
  const decided = await t.org('POST', '/payroll/advances/' + advance.payload?.id + '/decision', {
    status: 'APPROVED',
    comment: 'Approved for rent',
  });
  ok('the advance is approved', good(decided), status(decided));

  const run = await t.org('POST', '/payroll/runs', {
    periodStart: t.monthStart,
    periodEnd: t.today,
    payFrequency: 'MONTHLY',
  });
  const calculated = await t.org('POST', '/payroll/runs/' + run.payload?.id + '/calculate', {});
  ok('the run is calculated', good(calculated), status(calculated));
  const after = rows((await t.org('GET', '/payroll/advances?employeeId=' + t.a.id)).payload).find(
    (x) => x.id === advance.payload?.id,
  );
  ok(
    'one run takes back a quarter (2,000 of 8,000), not the whole advance',
    Number(after?.recoveredAmount) === 2000,
    'recovered ' + after?.recoveredAmount,
  );
}

finish();
