#!/usr/bin/env node
/**
 * Payroll integration check.
 *
 * Payroll is the module where every other module's truth has to arrive as money, so this script
 * drives one employee through a realistic lifecycle — salary profile, approved leave, attendance,
 * an approved timesheet, an adjustment — and then asserts what the *calculated backend result*
 * contains. As in the other verify scripts, assertions record what the backend actually does:
 * where a relationship is absent, the assertion pins its absence so it cannot quietly change.
 *
 *   pnpm verify:payroll
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The parsers the frontend repositories use. Running them over the live responses is what proves
 * the wired screens can actually read this API — a schema that drifts from the service fails here
 * rather than as an empty panel in the browser.
 */
const contracts = createRequire(import.meta.url)(resolve(ROOT, 'packages/contracts/dist/index.js'));
const BASE = 'http://localhost:4000';
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`  FAIL  ${label} -> ${JSON.stringify(actual)}`);
  }
};

function jar() {
  const s = new Map();
  return {
    absorb(r) {
      for (const raw of r.headers.getSetCookie?.() ?? []) {
        const [p] = raw.split(';');
        const i = p.indexOf('=');
        const n = p.slice(0, i).trim();
        const v = p.slice(i + 1).trim();
        if (v === '') s.delete(n);
        else s.set(n, v);
      }
    },
    header: () => [...s].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

async function call(j, method, path, body, extra) {
  const headers = { Accept: 'application/json', ...(extra ?? {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const c = j.header();
  if (c) headers.Cookie = c;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  j.absorb(r);
  let payload = null;
  try {
    payload = await r.json();
  } catch {}
  return { status: r.status, payload };
}

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** The whole of last month: a closed period payroll is allowed to price. */
function lastMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: iso(start), end: iso(end) };
}

function addDays(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The first Monday on or after `key`, so entries land on a working day. */
function mondayOnOrAfter(key) {
  let d = new Date(`${key}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const num = (value) => Number(value ?? NaN);

async function main() {
  const period = lastMonth();
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const slug = `pr-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Pr ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Pr Admin',
      reason: 'payroll verification',
    },
    PH,
  );
  check('onboard tenant', r.status, 201);
  const orgId = r.payload.organization.id;
  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  const AH = { 'x-csrf-token': r.payload.csrfToken };
  const org = (method, path, body) =>
    call(A, method, `/v1/organizations/${orgId}${path}`, body, method === 'GET' ? undefined : AH);

  r = await org('GET', '/branches');
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;
  r = await org('POST', '/employees', {
    employeeNumber: 'EMP-001',
    firstName: 'Asha',
    lastName: 'Rao',
    workEmail: `asha@${slug}.test`,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2024-03-15',
    primaryBranchId: branchId,
  });
  const employeeId = r.payload?.id;
  check('employee created', typeof employeeId, 'string');

  console.log('\npolicy and statutory rules');
  r = await org('PUT', '/payroll/policy', {
    effectiveFrom: '2024-01-01',
    salarySlipDefault: true,
    payrollEnabledDefault: true,
    payrollDayBasis: 30,
    basePercentage: 50,
    baseMinimum: 15000,
    hraPercentage: 40,
    pfDefault: true,
    esiDefault: false,
    ptDefault: true,
    statutoryJurisdiction: 'IN-KA',
    roundingMode: 'HALF_UP',
  });
  check('save the payroll policy', r.status, [200, 201]);
  r = await org('POST', '/payroll/statutory-rules', {
    schemeCode: 'EPF',
    jurisdiction: 'IN-KA',
    effectiveFrom: '2024-01-01',
    employeeRate: 12,
    employerRate: 13,
    wageCeiling: 15000,
  });
  check('save the EPF rule', r.status, [200, 201]);
  r = await org('POST', '/payroll/statutory-rules', {
    schemeCode: 'PT',
    jurisdiction: 'IN-KA',
    effectiveFrom: '2024-01-01',
    employeeThreshold: 15000,
    flatAmount: 200,
  });
  check('save the professional-tax rule', r.status, [200, 201]);

  r = await org('POST', '/payroll/profile', {
    employeeId,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: '2024-01-01',
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: true,
    esiEnabled: false,
    ptEnabled: true,
  });
  check('save the salary profile', r.status, [200, 201]);

  console.log('\ncompensation configuration');
  r = await org('POST', '/payroll/components', {
    code: 'SPECIAL_ALLOWANCE',
    name: 'Special allowance',
    componentType: 'EARNING',
    calculationType: 'FIXED',
    isTaxable: true,
    displayOrder: 10,
  });
  check('create a pay component', r.status, [200, 201]);
  const componentId = r.payload?.id;
  r = await org('GET', '/payroll/components');
  check('the component is in the catalogue', r.status, 200);
  check(
    'the catalogue parses for the frontend',
    (contracts.parsePayComponentList(r.payload) ?? []).some((entry) => entry.id === componentId),
    true,
  );
  r = await org('POST', '/payroll/components/assignments', {
    employeeId,
    payComponentId: componentId,
    amount: 2500,
    effectiveFrom: '2024-01-01',
  });
  check('assign the component to the employee', r.status, [200, 201]);
  r = await org('POST', '/payroll/components/assignments', {
    employeeId,
    payComponentId: componentId,
    amount: 3000,
    effectiveFrom: '2024-06-01',
  });
  // Effective dating is real: a second open-ended period overlaps the first, and the backend
  // refuses it rather than silently replacing history.
  check('an overlapping assignment is refused', r.status, [400, 409]);

  console.log('\nsalary structure is derived by the backend');
  r = await org('POST', '/payroll/preview', {
    employeeId,
    periodStart: period.start,
    periodEnd: period.end,
  });
  check('preview is reachable', r.status, [200, 201]);
  // 50% of 60000 = 30000 base; HRA is 40% of base; the rest is other allowance.
  check('base is derived from the policy', num(r.payload?.monthlyStructure?.base), 30000);
  check('HRA is derived from base', num(r.payload?.monthlyStructure?.hra), 12000);
  check(
    'other allowance is the remainder',
    num(r.payload?.monthlyStructure?.otherAllowance),
    18000,
  );
  const epfPreview = (r.payload?.statutory ?? []).find((s) => s.schemeCode === 'EPF');
  // EPF is 12% of the base capped at the 15000 wage ceiling.
  check('EPF is calculated on the backend', num(epfPreview?.employeeAmount), 1800);
  const ptPreview = (r.payload?.statutory ?? []).find((s) => s.schemeCode === 'PT');
  check('professional tax is calculated on the backend', num(ptPreview?.employeeAmount), 200);

  console.log('\nleave feeding payroll');
  r = await org('POST', '/leave/types', {
    code: 'PL',
    name: 'Paid leave',
    paid: true,
    accrualType: 'FIXED_ANNUAL',
    annualAllowance: 12,
    requiresAttachment: false,
  });
  const paidTypeId = r.payload?.id;
  r = await org('POST', '/leave/types', {
    code: 'LWP',
    name: 'Leave without pay',
    paid: false,
    accrualType: 'FIXED_ANNUAL',
    annualAllowance: 12,
    requiresAttachment: false,
  });
  const unpaidTypeId = r.payload?.id;
  await org('POST', `/leave/types/PL/assign`, { branchId });
  await org('POST', `/leave/types/LWP/assign`, { branchId });
  r = await org('GET', '/roles');
  const roleId = (Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? [])).find(
    (role) => role.code === 'ORG_ADMIN',
  )?.id;
  r = await org('POST', '/approval-policies', {
    domain: 'LEAVE',
    code: 'LV-DEF',
    name: 'Leave approvals',
    isDefault: true,
    steps: [{ stepNumber: 1, approverType: 'ROLE', roleId }],
  });
  check('create a default leave approval policy', r.status, [200, 201]);

  const paidStart = mondayOnOrAfter(period.start);
  const unpaidStart = mondayOnOrAfter(addDays(period.start, 14));
  const approve = async (requestId, comment) =>
    org('POST', `/leave/requests/${requestId}/decision`, { status: 'APPROVED', comment });
  r = await org('POST', '/leave/requests', {
    employeeId,
    leaveTypeId: paidTypeId,
    startDate: paidStart,
    endDate: addDays(paidStart, 2),
    reason: 'Paid leave in period',
    branchId,
  });
  check('create three days of paid leave', r.status, 201);
  check('approve the paid leave', (await approve(r.payload?.id, 'Approved paid')).status, 201);
  r = await org('POST', '/leave/requests', {
    employeeId,
    leaveTypeId: unpaidTypeId,
    startDate: unpaidStart,
    endDate: addDays(unpaidStart, 1),
    reason: 'Unpaid leave in period',
    branchId,
  });
  check('create two days of unpaid leave', r.status, 201);
  check('approve the unpaid leave', (await approve(r.payload?.id, 'Approved unpaid')).status, 201);

  console.log('\nattendance and timesheets feeding payroll');
  const workDay = mondayOnOrAfter(addDays(period.start, 21));
  r = await org('POST', '/attendance/check-ins', {
    employeeId,
    occurredAt: `${workDay}T09:00:00.000Z`,
    workDate: workDay,
    branchId,
  });
  check('check in on a working day', r.status, [200, 201]);
  r = await org('POST', '/attendance/check-outs', {
    employeeId,
    occurredAt: `${workDay}T18:00:00.000Z`,
    workDate: workDay,
    branchId,
  });
  check('check out on the same day', r.status, [200, 201]);

  r = await org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: period.start,
    periodEnd: period.end,
  });
  check('create a timesheet period', r.status, [200, 201]);
  const periodId = r.payload?.id;
  r = await org('POST', `/timesheets/periods/${periodId}/derive`);
  check('derive timesheets from attendance', r.status, [200, 201]);
  r = await org('GET', `/timesheets?employeeId=${employeeId}&periodId=${periodId}`);
  const timesheetId = (r.payload?.timesheets ?? r.payload ?? [])[0]?.id;
  check('a timesheet exists for the employee', typeof timesheetId, 'string');
  r = await org('POST', `/timesheets/${timesheetId}/entries`, {
    workDate: workDay,
    minutes: 480,
    overtimeMinutes: 120,
    description: 'Overtime on a release day',
  });
  check('add two hours of overtime', r.status, [200, 201]);

  console.log('\npayroll run');
  r = await org('POST', '/payroll/runs', { periodStart: period.start, periodEnd: period.end });
  check('create a payroll run', r.status, [200, 201]);
  const runId = r.payload?.id;
  r = await org('POST', `/payroll/runs/${runId}/calculate`);
  check('calculation refuses an unapproved timesheet', r.status, [400, 409]);

  await org('POST', `/timesheets/${timesheetId}/submit`);
  r = await org('POST', `/timesheets/${timesheetId}/decision`, {
    status: 'APPROVED',
    comment: 'Approved for payroll',
  });
  check('approve the timesheet', r.status, [200, 201]);

  r = await org('GET', `/timesheets?employeeId=${employeeId}&periodId=${periodId}`);
  const approvedSheet = (r.payload?.timesheets ?? r.payload ?? [])[0];
  // 60 minutes come from the derived attendance day (nine hours against a 480-minute standard
  // day) and 120 from the manual entry, so attendance reaches payroll through the timesheet.
  const overtimeMinutes = num(approvedSheet?.overtimeMinutes);
  check('the approved timesheet carries attendance and manual overtime', overtimeMinutes, 180);

  r = await org('POST', `/payroll/runs/${runId}/adjustments`, {
    payrollRunId: runId,
    employeeId,
    type: 'BONUS',
    amount: 1000,
    description: 'Performance bonus',
    taxable: true,
  });
  check('add a bonus before calculating', r.status, [200, 201]);

  r = await org('POST', `/payroll/runs/${runId}/calculate`);
  check('calculate the run', r.status, [200, 201]);
  check('the run is calculated', r.payload?.status, 'CALCULATED');

  console.log('\na late adjustment invalidates the calculation instead of being lost');
  // Writing an adjustment to a calculated run marks the calculation stale. The run cannot be
  // approved or released until it is calculated again, so the money always includes the change.
  r = await org('POST', `/payroll/runs/${runId}/adjustments`, {
    payrollRunId: runId,
    employeeId,
    type: 'BONUS',
    amount: 500,
    description: 'Late bonus',
    taxable: true,
  });
  check('an adjustment after calculation is accepted', r.status, [200, 201]);
  r = await org('POST', `/payroll/runs/${runId}/action`, {
    target: 'APPROVED',
    comment: 'Trying to approve stale figures',
  });
  check('a stale run cannot be approved', r.status, [400, 409]);
  r = await org('POST', `/payroll/runs/${runId}/calculate`);
  check('a stale run can be recalculated', r.status, [200, 201]);
  r = await org('POST', `/payroll/runs/${runId}/calculate`);
  check('and once fresh it is not recalculated again', r.status, [400, 409]);

  console.log('\nthe calculated result reflects every input');
  r = await org('POST', `/payroll/runs/${runId}/action`, {
    target: 'APPROVED',
    comment: 'Approved for release',
  });
  check('approve the run', r.status, [200, 201]);
  r = await org('POST', `/payroll/runs/${runId}/action`, {
    target: 'RELEASED',
    comment: 'Released to employees',
  });
  check('release the run', r.status, [200, 201]);

  r = await org('GET', `/payroll/payslips?employeeId=${employeeId}`);
  check('a payslip exists after release', r.status, 200);
  const payslip = (r.payload ?? [])[0];
  check('the payslip belongs to this run', payslip?.run?.id, runId);
  const componentOf = (code) =>
    num((payslip?.components ?? []).find((c) => c.componentCode === code)?.amount);

  // 30 day basis - 2 unpaid leave days = 28 payable days. Paid leave must not reduce pay.
  const payable = 28 / 30;
  const expectedBase = Math.round(30000 * payable * 100) / 100;
  const expectedHra = Math.round(12000 * payable * 100) / 100;
  const expectedGrossBeforeExtras = Math.round(60000 * payable * 100) / 100;
  // 60000 / (480 * 30) per minute * the approved overtime minutes * the 1.5 multiplier.
  const expectedOvertime = Math.round((60000 / (480 * 30)) * overtimeMinutes * 1.5 * 100) / 100;
  // 1000 before calculation and 500 added after it: the late one is included because the run had
  // to be recalculated before it could be approved.
  const expectedGross = expectedGrossBeforeExtras + expectedOvertime + 1000 + 500;
  // EPF on the prorated base capped at 15000, plus flat professional tax.
  const expectedEpf = Math.round(Math.min(expectedBase, 15000) * 0.12 * 100) / 100;
  const expectedDeduction = expectedEpf + 200;

  check('the payslip prorates base for unpaid leave', componentOf('BASE'), expectedBase);
  check('the payslip prorates HRA for unpaid leave', componentOf('HRA'), expectedHra);
  check(
    'gross includes overtime and both bonuses',
    num(payslip?.totals?.grossAmount),
    expectedGross,
  );
  check(
    'deductions are the backend statutory amounts',
    num(payslip?.totals?.deductionAmount),
    expectedDeduction,
  );
  check(
    'net is gross minus deductions',
    num(payslip?.totals?.netAmount),
    Math.round((expectedGross - expectedDeduction) * 100) / 100,
  );

  console.log('\npersistence');
  r = await org('GET', `/payroll/payslips?employeeId=${employeeId}`);
  const refetched = (r.payload ?? [])[0];
  check('the payslip survives a refetch', refetched?.id, payslip?.id);
  check(
    'and reports the same net',
    num(refetched?.totals?.netAmount),
    num(payslip?.totals?.netAmount),
  );
  r = await org('GET', '/payroll/runs');
  check(
    'the run is listed as released',
    (r.payload ?? []).find((run) => run.id === runId)?.status,
    'RELEASED',
  );

  console.log('\nthe frontend contracts parse the live responses');
  r = await org('GET', `/payroll/payslips?employeeId=${employeeId}`);
  check('payslip list parses', contracts.parsePayslipList(r.payload) !== null, true);
  r = await org('GET', '/payroll/runs');
  const parsedRuns = contracts.parsePayrollRunList(r.payload);
  check('payroll run list parses', parsedRuns !== null, true);
  check(
    'the released run is not reported as stale',
    (parsedRuns ?? []).some((entry) => entry.id === runId && contracts.isCalculationStale(entry)),
    false,
  );
  r = await org('GET', `/payroll/profile?employeeId=${employeeId}`);
  const parsedProfile = contracts.parseSalaryProfile(r.payload);
  check('salary profile parses', parsedProfile !== null, true);
  check(
    'the profile carries the backend salary breakdown',
    Number(parsedProfile?.salaryBreakdown?.gross),
    60000,
  );
  r = await org('GET', `/payroll/advances?employeeId=${employeeId}`);
  check('salary advance list parses', contracts.parseSalaryAdvanceList(r.payload) !== null, true);

  console.log('\ncompensation persists and is read back');
  r = await org('GET', `/payroll/profile?employeeId=${employeeId}`);
  const reread = contracts.parseSalaryProfile(r.payload);
  const assignment = (reread?.components ?? []).find(
    (entry) => entry.payComponentId === componentId,
  );
  check('the assignment survives a refetch', assignment !== undefined, true);
  check('with the amount that was configured', Number(assignment?.amount), 2500);
  check(
    'and the effective date it was given',
    assignment?.effectiveFrom?.slice(0, 10),
    '2024-01-01',
  );
  // The assigned earning is priced by payroll out of the other allowance, so gross is unchanged
  // and the component appears in the employee's own breakdown.
  check(
    'the component appears in the backend salary breakdown',
    (reread?.salaryBreakdown?.earnings ?? []).some((entry) => entry.code === 'SPECIAL_ALLOWANCE'),
    true,
  );

  console.log('\na mid-period joiner is paid only for the days they were employed');
  // `payrollDayBasis` is a fixed monthly divisor, so a day outside employment is unpaid exactly
  // like an unpaid leave day. Before employment dates were counted, someone who joined on the
  // sixteenth was paid a full month.
  const midMonth = addDays(period.start, 15);
  r = await org('POST', '/employees', {
    employeeNumber: 'EMP-MID',
    firstName: 'Mid',
    lastName: 'Joiner',
    workEmail: `mid@${slug}.test`,
    employmentType: 'FULL_TIME',
    dateOfJoining: midMonth,
    primaryBranchId: branchId,
  });
  const joinerId = r.payload?.id;
  check('create an employee who joined mid-period', r.status, [200, 201]);
  r = await org('POST', '/payroll/profile', {
    employeeId: joinerId,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: midMonth,
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  check('give them a salary', r.status, [200, 201]);

  r = await org('POST', '/payroll/preview', {
    employeeId: joinerId,
    periodStart: period.start,
    periodEnd: period.end,
  });
  // Preview measures only as far as today, but its day accounting must match the run's: the days
  // before joining are excluded there too.
  check('preview excludes the days before joining', r.status, [200, 201]);
  check(
    'so preview never offers more payable days than employment allows',
    num(r.payload?.payableDays) <= 15,
    true,
  );

  console.log('\nremaining recorded gaps');
  // The working-day count is recorded in the calculation breakdown and never used: proration is
  // always against the flat payroll day basis, so holidays and the work week do not change pay.
  check(
    'payroll exposes no native line-item route before release',
    (await org('GET', '/payroll/ledger')).status,
    404,
  );
  // The payslip carries totals and components but not the breakdown, so a payslip cannot show
  // payable days or loss-of-pay days.
  check('the payslip does not expose payable days', payslip?.payableDays, undefined);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
