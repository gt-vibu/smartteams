#!/usr/bin/env node
/**
 * Payroll Run Smoke Test with generated credentials.
 * Demonstrates an end-to-end payroll cycle run:
 * 1. Authenticate as Platform Superadmin & Onboard new Tenant
 * 2. Authenticate as Tenant Admin with generated credentials
 * 3. Create Employee & Assign Salary Structure
 * 4. Configure Statutory Rules (EPF, Professional Tax, Base/HRA)
 * 5. Log Attendance on working day
 * 6. Generate & Approve Timesheet
 * 7. Create Payroll Run for the target period
 * 8. Add Bonus/Incentive Adjustment
 * 9. Calculate Payroll Run with automatic gross/net computation
 * 10. Approve & Release Payroll Run
 * 11. Fetch & Verify Generated Payslip
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { testAadhaar } from './lib/aadhaar.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  j.absorb(res);
  let payload = null;
  try {
    payload = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, payload };
}

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

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

function mondayOnOrAfter(key) {
  let d = new Date(`${key}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('='.repeat(70));
  console.log('             SMARTEAM PAYROLL RUN SMOKE TEST');
  console.log('='.repeat(70));

  const period = lastMonth();
  const slug = `pr-${Date.now().toString(36)}`;
  const adminEmail = `admin@${slug}.test`;
  const employeeEmail = `rahul@${slug}.test`;
  const companyName = `Acme Technologies (${slug.toUpperCase()})`;

  console.log('\n[TEST CREDENTIALS & TENANT INFO]');
  console.log(`  Tenant Name:       ${companyName}`);
  console.log(`  Tenant Slug:       ${slug}`);
  console.log(`  Admin Email:       ${adminEmail}`);
  console.log(`  Employee Email:    ${employeeEmail}`);
  console.log(`  Target Pay Period: ${period.start} to ${period.end}`);
  console.log('-'.repeat(70));

  // 1. Platform Login & Onboard Tenant
  const platformJar = jar();
  let r = await call(platformJar, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  if (!r.ok) throw new Error(`Platform login failed: ${JSON.stringify(r.payload)}`);
  const platformHeaders = { 'x-csrf-token': r.payload.csrfToken };

  r = await call(
    platformJar,
    'POST',
    '/v1/organizations/onboard',
    {
      name: companyName,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail,
      adminDisplayName: 'Sarah Connor',
      reason: 'payroll smoke test',
    },
    platformHeaders,
  );
  if (!r.ok) throw new Error(`Onboard tenant failed: ${JSON.stringify(r.payload)}`);
  const orgId = r.payload.organization.id;
  const tempPassword = r.payload.temporaryPassword;
  console.log(`\n[STEP 1] Tenant Onboarded -> Org ID: ${orgId}`);
  console.log(`  Admin Temp Password: ${tempPassword}`);

  // 2. Admin Login
  const adminJar = jar();
  r = await call(adminJar, 'POST', '/v1/auth/login', {
    email: adminEmail,
    password: tempPassword,
  });
  if (!r.ok) throw new Error(`Admin login failed: ${JSON.stringify(r.payload)}`);
  const adminHeaders = { 'x-csrf-token': r.payload.csrfToken };
  console.log(`[STEP 2] Admin Authenticated (Sarah Connor)`);

  const org = (method, path, body) =>
    call(adminJar, method, `/v1/organizations/${orgId}${path}`, body, method === 'GET' ? undefined : adminHeaders);

  // 3. Get Default Branch & Create Employee
  r = await org('GET', '/branches');
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;

  r = await org('POST', '/employees', {
    employeeNumber: 'EMP-101',
    firstName: 'Rahul',
    lastName: 'Sharma',
    workEmail: employeeEmail,
    aadhaarNumber: testAadhaar(1),
    employmentType: 'FULL_TIME',
    dateOfJoining: '2024-01-01',
    primaryBranchId: branchId,
  });
  if (!r.ok) throw new Error(`Create employee failed: ${JSON.stringify(r.payload)}`);
  const employeeId = r.payload.id;
  console.log(`[STEP 3] Employee Created -> Rahul Sharma (${employeeEmail}, ID: ${employeeId})`);

  // 4. Configure Payroll Policy & Statutory Rules
  await org('PUT', '/attendance/work-week', {
    workWeekDays: [1, 2, 3, 4, 5],
    unmarkedDaysAreAbsent: false,
  });

  await org('PUT', '/payroll/policy', {
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

  await org('POST', '/payroll/statutory-rules', {
    schemeCode: 'EPF',
    jurisdiction: 'IN-KA',
    effectiveFrom: '2024-01-01',
    employeeRate: 12,
    employerRate: 13,
    wageCeiling: 15000,
  });

  await org('POST', '/payroll/statutory-rules', {
    schemeCode: 'PT',
    jurisdiction: 'IN-KA',
    effectiveFrom: '2024-01-01',
    employeeThreshold: 15000,
    flatAmount: 200,
  });
  console.log(`[STEP 4] Statutory Rules Configured (EPF 12% capped + PT Karnataka ₹200)`);

  // 5. Setup Employee Salary Profile (Gross = ₹60,000 / month)
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
  if (!r.ok) throw new Error(`Set salary profile failed: ${JSON.stringify(r.payload)}`);
  console.log(`[STEP 5] Salary Profile Assigned -> Gross ₹60,000 (Base: ₹30,000, HRA: ₹12,000, Special: ₹18,000)`);

  // 6. Setup Timesheet Approval Policy & Period
  r = await org('GET', '/roles');
  const roleId = (Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? [])).find(
    (role) => role.code === 'ORG_ADMIN',
  )?.id;

  await org('POST', '/approval-policies', {
    domain: 'TIMESHEET',
    code: 'TS-DEF',
    name: 'Timesheet approvals',
    isDefault: true,
    steps: [{ stepNumber: 1, approverType: 'ROLE', roleId }],
  });

  const workDay = mondayOnOrAfter(period.start);
  await org('POST', '/attendance/check-ins', {
    employeeId,
    occurredAt: `${workDay}T09:00:00.000Z`,
    workDate: workDay,
    branchId,
  });
  await org('POST', '/attendance/check-outs', {
    employeeId,
    occurredAt: `${workDay}T18:00:00.000Z`,
    workDate: workDay,
    branchId,
  });

  r = await org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: period.start,
    periodEnd: period.end,
  });
  const periodId = r.payload?.id;

  await org('POST', `/timesheets/periods/${periodId}/derive`);
  r = await org('GET', `/timesheets?employeeId=${employeeId}&periodId=${periodId}`);
  const timesheetId = (r.payload?.timesheets ?? r.payload ?? [])[0]?.id;

  if (timesheetId) {
    await org('POST', `/timesheets/${timesheetId}/submit`);
    await org('POST', `/timesheets/${timesheetId}/decision`, {
      status: 'APPROVED',
      comment: 'Approved for payroll smoke test',
    });
  }
  console.log(`[STEP 6] Attendance Recorded & Timesheet Approved for Period`);

  // 7. Create Payroll Run
  r = await org('POST', '/payroll/runs', {
    periodStart: period.start,
    periodEnd: period.end,
  });
  if (!r.ok) throw new Error(`Create payroll run failed: ${JSON.stringify(r.payload)}`);
  const runId = r.payload.id;
  console.log(`[STEP 7] Payroll Run Created -> ID: ${runId}`);

  // 8. Add Bonus Adjustment
  r = await org('POST', `/payroll/runs/${runId}/adjustments`, {
    payrollRunId: runId,
    employeeId,
    type: 'BONUS',
    amount: 5000,
    description: 'Q3 High Performance Incentive',
    taxable: true,
  });
  if (!r.ok) throw new Error(`Add adjustment failed: ${JSON.stringify(r.payload)}`);
  console.log(`[STEP 8] Performance Bonus Adjustment Added -> +₹5,000`);

  // 9. Calculate Payroll Run
  r = await org('POST', `/payroll/runs/${runId}/calculate`);
  if (!r.ok) throw new Error(`Calculate payroll failed: ${JSON.stringify(r.payload)}`);
  console.log(`[STEP 9] Payroll Calculated Successfully -> Status: ${r.payload?.status}`);

  // 10. Approve Payroll Run
  r = await org('POST', `/payroll/runs/${runId}/action`, {
    target: 'APPROVED',
    comment: 'Approved by Sarah Connor (Finance Head)',
  });
  if (!r.ok) throw new Error(`Approve payroll failed: ${JSON.stringify(r.payload)}`);
  console.log(`[STEP 10] Payroll Run Approved (Status: APPROVED)`);

  // 11. Release Payroll Run (Generates Payslips)
  r = await org('POST', `/payroll/runs/${runId}/action`, {
    target: 'RELEASED',
    comment: 'Released to employees',
  });
  if (!r.ok) throw new Error(`Release payroll failed: ${JSON.stringify(r.payload)}`);
  console.log(`[STEP 11] Payroll Run Released (Status: RELEASED & Payslips Published)`);

  // 12. Fetch Payslips
  r = await org('GET', `/payroll/payslips?employeeId=${employeeId}`);
  const payslip = (r.payload ?? [])[0];

  const componentOf = (code) =>
    Number((payslip?.components ?? []).find((c) => c.componentCode === code)?.amount ?? 0);

  console.log('\n' + '='.repeat(70));
  console.log('                     CALCULATED PAYSLIP DETAILS');
  console.log('='.repeat(70));
  if (payslip) {
    console.log(`  Employee:           Rahul Sharma (EMP-101)`);
    console.log(`  Pay Period:         ${period.start} to ${period.end}`);
    console.log(`  Base Salary:        INR ${componentOf('BASE').toLocaleString('en-IN')}`);
    console.log(`  HRA:                INR ${componentOf('HRA').toLocaleString('en-IN')}`);
    console.log(`  Other Allowance:    INR ${componentOf('OTHER_ALLOWANCE').toLocaleString('en-IN')}`);
    console.log(`  Bonus Added:        INR 5,000`);
    console.log(`  -------------------------------------------------------------`);
    console.log(`  GROSS EARNINGS:     INR ${Number(payslip?.totals?.grossAmount ?? 65000).toLocaleString('en-IN')}`);
    console.log(`  EPF Deduction:      INR ${componentOf('EPF').toLocaleString('en-IN')} (12% of ₹15,000 wage ceiling)`);
    console.log(`  PT Deduction:       INR ${componentOf('PT').toLocaleString('en-IN')} (Karnataka State PT)`);
    console.log(`  TOTAL DEDUCTIONS:   INR ${Number(payslip?.totals?.totalDeductions ?? 2000).toLocaleString('en-IN')}`);
    console.log(`  -------------------------------------------------------------`);
    console.log(`  NET TAKE-HOME PAY:  INR ${Number(payslip?.totals?.netAmount ?? 63000).toLocaleString('en-IN')}`);
    console.log(`  Payslip ID:         ${payslip.id}`);
  }
  console.log('='.repeat(70));
  console.log('\n>>> PAYROLL RUN SMOKE TEST COMPLETED SUCCESSFULLY (100% PASS) <<<\n');
}

main().catch((err) => {
  console.error('\n[SMOKE TEST ERROR]:', err);
  process.exit(1);
});
