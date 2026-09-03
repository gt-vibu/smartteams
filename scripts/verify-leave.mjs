#!/usr/bin/env node
/**
 * Leave domain integration check, including the cross-module behaviour.
 *
 * The second half deliberately asserts what the backend *actually* does across Leave, Attendance,
 * Timesheets and Payroll rather than what an integrated system would ideally do. Where a
 * relationship does not exist, the assertion records its absence so the gap cannot quietly close
 * or quietly appear without this failing.
 *
 *   pnpm verify:leave
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

/** A Monday well inside the current month, so the range is working days. */
function upcomingMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** A Monday inside the previous month, so payroll's to-date window includes it. */
function lastMonthMonday() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const slug = `lv-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Lv ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Lv Admin',
      reason: 'leave verification',
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

  r = await call(A, 'GET', `/v1/organizations/${orgId}/branches`);
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/employees`,
    {
      employeeNumber: 'EMP-001',
      firstName: 'Asha',
      lastName: 'Rao',
      workEmail: `asha@${slug}.test`,
      employmentType: 'FULL_TIME',
      dateOfJoining: '2024-03-15',
      primaryBranchId: branchId,
    },
    AH,
  );
  const employeeId = r.payload?.id;

  r = await call(A, 'GET', `/v1/organizations/${orgId}/roles`);
  const roleId = (Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? [])).find(
    (role) => role.code === 'ORG_ADMIN',
  )?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/approval-policies`,
    {
      domain: 'LEAVE',
      code: 'LV-DEF',
      name: 'Leave approvals',
      isDefault: true,
      steps: [{ stepNumber: 1, approverType: 'ROLE', roleId }],
    },
    AH,
  );
  check('create a default leave approval policy', r.status, 201);

  console.log('\nleave types and assignment');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/types`,
    {
      code: 'CL',
      name: 'Casual Leave',
      paid: true,
      accrualType: 'FIXED_ANNUAL',
      annualAllowance: 12,
      requiresAttachment: false,
    },
    AH,
  );
  check('create a paid leave type', r.status, 201);
  const paidTypeId = r.payload?.id;

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/types`,
    {
      code: 'LWP',
      name: 'Leave Without Pay',
      paid: false,
      accrualType: 'FIXED_ANNUAL',
      annualAllowance: 30,
      requiresAttachment: false,
    },
    AH,
  );
  check('create an unpaid leave type', r.status, 201);
  const unpaidTypeId = r.payload?.id;

  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/types`);
  check('GET leave types', r.status, 200);
  check('both types are listed', Array.isArray(r.payload) ? r.payload.length : -1, 2);

  r = await call(A, 'POST', `/v1/organizations/${orgId}/leave/types/CL/assign`, { branchId }, AH);
  check('assign the paid type to the branch', r.status, 201);
  r = await call(A, 'POST', `/v1/organizations/${orgId}/leave/types/LWP/assign`, { branchId }, AH);
  check('assign the unpaid type to the branch', r.status, 201);

  console.log('\nbalances (new route)');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  check('GET balances', r.status, 200);
  const balances = r.payload ?? [];
  check('a balance is provisioned per assigned type', balances.length, 2);
  const paidBalance = balances.find((b) => b.leaveTypeId === paidTypeId);
  check('the paid balance starts fully available', Number(paidBalance?.availableAmount), 12);
  check('nothing is reserved yet', Number(paidBalance?.reservedAmount), 0);

  console.log('\nrequest lifecycle');
  const start = upcomingMonday();
  const end = addDays(start, 2);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests`,
    {
      employeeId,
      leaveTypeId: paidTypeId,
      startDate: start,
      endDate: end,
      reason: 'Family event',
      branchId,
    },
    AH,
  );
  check('create a leave request', r.status, 201);
  const requestId = r.payload?.id;
  check('three working days are counted', Number(r.payload?.requestedDays), 3);
  check('it starts pending', r.payload?.status, 'PENDING');

  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/requests?employeeId=${employeeId}`);
  check('GET requests (new route)', r.status, 200);
  check('the request is listed', r.payload?.requests?.length, 1);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/requests/inbox`);
  check('GET approval inbox (new route)', r.status, 200);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  let paid = (r.payload ?? []).find((b) => b.leaveTypeId === paidTypeId);
  check('the pending request reserves days', Number(paid?.reservedAmount), 3);
  check('and removes them from available', Number(paid?.availableAmount), 9);

  console.log('\napproval');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${requestId}/decision`,
    {
      status: 'APPROVED',
    },
    AH,
  );
  check('a decision without a comment is rejected', r.status, 400);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${requestId}/decision`,
    {
      status: 'APPROVED',
      comment: 'Approved by manager',
    },
    AH,
  );
  check('approve the request', r.status, 201);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  paid = (r.payload ?? []).find((b) => b.leaveTypeId === paidTypeId);
  check('approval converts the reservation to usage', Number(paid?.usedAmount), 3);
  check('nothing stays reserved', Number(paid?.reservedAmount), 0);
  check('available stays reduced', Number(paid?.availableAmount), 9);

  console.log('\ncross-module: approved leave -> attendance');
  r = await call(
    A,
    'GET',
    `/v1/organizations/${orgId}/attendance?employeeId=${employeeId}&from=${start}&to=${end}`,
  );
  check('GET attendance for the leave dates', r.status, 200);
  // Recorded behaviour, not desired behaviour: no attendance record is produced for an approved
  // leave day. The attendance calendar therefore cannot show the day as leave.
  check('approved leave creates NO attendance record', r.payload?.records?.length, 0);

  console.log('\ncross-module: approved leave -> timesheets');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/timesheets?employeeId=${employeeId}`);
  check('GET timesheets is reachable', r.status, 200);
  const sheets = r.payload?.timesheets ?? r.payload ?? [];
  // Recorded behaviour: approving leave produces no timesheet and no entry. Nothing in the
  // timesheet module references leave at all.
  check('approved leave creates NO timesheet', Array.isArray(sheets) ? sheets.length : -1, 0);

  console.log('\ncross-module: approved leave -> payroll');
  // The preview prices a period only as far as today, so leave has to sit in the past for the
  // calculation to see it. A future-dated request is correctly excluded, which is why the
  // upcoming request above contributes nothing here.
  const pastStart = lastMonthMonday();
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests`,
    {
      employeeId,
      leaveTypeId: paidTypeId,
      startDate: pastStart,
      endDate: addDays(pastStart, 2),
      reason: 'Past paid leave',
      branchId,
    },
    AH,
  );
  check('create a past paid leave request', r.status, 201);
  const pastPaidId = r.payload?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${pastPaidId}/decision`,
    {
      status: 'APPROVED',
      comment: 'Approved paid',
    },
    AH,
  );
  check('approve the past paid request', r.status, 201);

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests`,
    {
      employeeId,
      leaveTypeId: unpaidTypeId,
      startDate: addDays(pastStart, 7),
      endDate: addDays(pastStart, 8),
      reason: 'Past unpaid leave',
      branchId,
    },
    AH,
  );
  check('create a past unpaid leave request', r.status, 201);
  const pastUnpaidId = r.payload?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${pastUnpaidId}/decision`,
    {
      status: 'APPROVED',
      comment: 'Approved unpaid',
    },
    AH,
  );
  check('approve the past unpaid request', r.status, 201);

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/payroll/profile`,
    {
      employeeId,
      grossSalary: 60000,
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      overtimeMultiplier: 1.5,
      effectiveFrom: '2024-01-01',
      payrollEnabled: true,
      salarySlipMode: 'ENABLED',
      pfEnabled: false,
      esiEnabled: false,
      ptEnabled: false,
    },
    AH,
  );
  check('save a salary profile', r.status, [200, 201]);

  const periodStart = `${pastStart.slice(0, 8)}01`;
  const periodEnd = addDays(pastStart, 20);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/payroll/preview`,
    {
      employeeId,
      periodStart,
      periodEnd,
    },
    AH,
  );
  check('payroll preview is reachable', r.status, [200, 201]);
  const leave = r.payload?.leave;
  check('payroll counts the paid leave days', Number(leave?.paidDays), 3);
  check('payroll counts the unpaid leave days', Number(leave?.unpaidDays), 2);
  // Unpaid leave reduces payable days; paid leave does not. That is the whole relationship.
  const basis = Number(r.payload?.dayBasis);
  const elapsedDays =
    Math.round(
      (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86400000,
    ) + 1;
  check(
    'unpaid leave reduces payable days, paid leave does not',
    Number(r.payload?.payableDays),
    Math.min(basis, elapsedDays) - 2,
  );

  console.log('\ncancellation');
  // Measured as a delta: other approved requests exist by this point, so absolute figures would
  // encode the order of the script rather than the behaviour under test.
  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  const beforeCancel = (r.payload ?? []).find((b) => b.leaveTypeId === paidTypeId);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${requestId}/cancel`,
    {
      reason: 'Plans changed',
    },
    AH,
  );
  check('cancel an approved request', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  paid = (r.payload ?? []).find((b) => b.leaveTypeId === paidTypeId);
  check(
    'cancelling an approved request reverses the usage',
    Number(beforeCancel?.usedAmount) - Number(paid?.usedAmount),
    3,
  );
  check(
    'and returns the days to available',
    Number(paid?.availableAmount) - Number(beforeCancel?.availableAmount),
    3,
  );

  console.log('\nrejection');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests`,
    {
      employeeId,
      leaveTypeId: paidTypeId,
      startDate: addDays(start, 14),
      endDate: addDays(start, 14),
      reason: 'Second request',
      branchId,
    },
    AH,
  );
  const rejectId = r.payload?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${rejectId}/decision`,
    {
      status: 'REJECTED',
      comment: 'Coverage unavailable',
    },
    AH,
  );
  check('reject a request', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  const afterReject = (r.payload ?? []).find((b) => b.leaveTypeId === paidTypeId);
  check(
    'rejection releases the reservation back to available',
    Number(afterReject?.availableAmount),
    Number(paid?.availableAmount),
  );

  console.log('\nbalance adjustment');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/leave/balances/adjust`,
    {
      employeeId,
      leaveTypeId: paidTypeId,
      amount: 2,
      reason: 'Carried over from last year',
      periodStart: paid?.periodStart?.slice(0, 10),
      periodEnd: paid?.periodEnd?.slice(0, 10),
    },
    AH,
  );
  check('adjust a balance', r.status, 201);

  console.log('\ntenant isolation');
  const slugB = `lvb-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Other ${slugB}`,
      slug: slugB,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slugB}.test`,
      adminDisplayName: 'Other',
      reason: 'isolation check',
    },
    PH,
  );
  const B = jar();
  r = await call(B, 'POST', '/v1/auth/login', {
    email: `admin@${slugB}.test`,
    password: r.payload.temporaryPassword,
  });
  const BH = { 'x-csrf-token': r.payload?.csrfToken };
  r = await call(B, 'GET', `/v1/organizations/${orgId}/leave/requests`);
  check('tenant B cannot read tenant A leave requests', r.status, 403);
  r = await call(B, 'GET', `/v1/organizations/${orgId}/leave/balances?employeeId=${employeeId}`);
  check('tenant B cannot read tenant A balances', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/leave/requests/${rejectId}/cancel`,
    {
      reason: 'cross-tenant attempt',
    },
    BH,
  );
  check('tenant B cannot cancel a tenant A request', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/leave/balances/adjust`,
    {
      employeeId,
      leaveTypeId: paidTypeId,
      amount: 99,
      reason: 'cross-tenant attempt',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    },
    BH,
  );
  check('tenant B cannot adjust a tenant A balance', r.status, 403);
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('aborted:', e.message);
    process.exit(1);
  });
