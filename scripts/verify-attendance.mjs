#!/usr/bin/env node
/**
 * Attendance domain integration check.
 *
 * Covers the whole workflow the screens depend on: punch in and out, list, raise a correction,
 * list corrections, the approval inbox, decide, and read and write the policy. Three of these
 * routes did not exist on the native controller before this module was reconciled.
 *
 *   pnpm verify:attendance
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

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

  const slug = `att-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Att ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Att Admin',
      reason: 'attendance verification',
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
    },
    AH,
  );
  const employeeId = r.payload?.id;
  const workDate = today();

  // Corrections require a default ATTENDANCE_CORRECTION approval policy. A fresh tenant has
  // none, and the API correctly refuses with a 409 until one exists -- the UI surfaces that
  // message rather than a generic failure.
  r = await call(A, 'GET', `/v1/organizations/${orgId}/approval-policies`);
  check('GET approval policies', r.status, 200);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/${'00000000-0000-4000-8000-000000000000'}/corrections`,
    {
      reason: 'Forgot to punch out before leaving the office',
    },
    AH,
  );
  check('a correction on an unknown record is a 404, not a server error', r.status, 404);

  // A ROLE approver is the only type reachable for a tenant onboarded through the API: USER
  // requires the approver to already have an employee record, and there is no route that links
  // a user account to one.
  r = await call(A, 'GET', `/v1/organizations/${orgId}/roles`);
  check('GET roles', r.status, 200);
  const roles = Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? []);
  // The administrator role, not merely the first one: a tenant also has a least-privilege
  // EMPLOYEE role, which sorts earlier and cannot approve anything.
  const roleId = roles.find((role) => role.code === 'ORG_ADMIN')?.id;
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/approval-policies`,
    {
      domain: 'ATTENDANCE_CORRECTION',
      code: 'ATT-DEF',
      name: 'Attendance corrections',
      isDefault: true,
      steps: [{ stepNumber: 1, approverType: 'ROLE', roleId }],
    },
    AH,
  );
  check('create a default correction approval policy', r.status, 201);

  // A correction resolves approvers against the record's branch, so the punch carries one.
  r = await call(A, 'GET', `/v1/organizations/${orgId}/branches`);
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;
  check('the tenant has a branch to punch against', typeof branchId, 'string');

  console.log('\npunch in and out');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance?employeeId=${employeeId}`);
  check('GET attendance', r.status, 200);
  check('a new tenant has no attendance', r.payload?.records?.length, 0);

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/check-ins`,
    {
      employeeId,
      occurredAt: new Date().toISOString(),
      workDate,
      branchId,
    },
    AH,
  );
  check('check in', r.status, 201);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance?employeeId=${employeeId}`);
  check('the punch is listed', r.payload?.records?.length, 1);
  const record = r.payload?.records?.[0];
  const attendanceId = record?.id;
  check('the record carries the punch', record?.punches?.length, 1);
  // The UI derives "checked in" from the last punch being an IN, so this must hold.
  check('last punch is IN', record?.punches?.at(-1)?.punchType, 'IN');
  check(
    'the record carries the employee for the admin roster',
    record?.employee?.employeeNumber,
    'EMP-001',
  );

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/check-outs`,
    {
      employeeId,
      occurredAt: new Date(Date.now() + 60_000).toISOString(),
      workDate,
      branchId,
    },
    AH,
  );
  check('check out', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance?employeeId=${employeeId}`);
  check('both punches are retained', r.payload?.records?.[0]?.punches?.length, 2);
  check('last punch is OUT', r.payload?.records?.[0]?.punches?.at(-1)?.punchType, 'OUT');

  console.log('\ncorrections');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/${attendanceId}/corrections`,
    {
      reason: 'short',
    },
    AH,
  );
  check('a reason under ten characters is rejected', r.status, 400);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/${attendanceId}/corrections`,
    {
      reason: 'Forgot to punch out before leaving the office',
    },
    AH,
  );
  check('raise a correction', r.status, 201);

  // These three routes did not exist on the native controller before this module was wired.
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/corrections`);
  check('GET corrections (new route)', r.status, 200);
  check('the correction is listed', r.payload?.corrections?.length, 1);
  const correctionId = r.payload?.corrections?.[0]?.id;
  check('it is pending', r.payload?.corrections?.[0]?.status, 'PENDING');

  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/corrections?status=APPROVED`);
  check('the status filter works', r.payload?.corrections?.length, 0);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/corrections/inbox`);
  check('GET approval inbox (new route)', r.status, 200);

  console.log('\ndecision');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/${correctionId}/decision`,
    {
      status: 'APPROVED',
    },
    AH,
  );
  check('a decision without a comment is rejected', r.status, 400);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/${correctionId}/decision`,
    {
      status: 'APPROVED',
      comment: 'Verified against the door log',
    },
    AH,
  );
  check('approve the correction', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/corrections`);
  check('the decision persisted', r.payload?.corrections?.[0]?.status, 'APPROVED');

  console.log('\npolicy');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/preferences`);
  check('GET preferences (new route)', r.status, 200);
  check('it reports where the value came from', typeof r.payload?.geofenceOwnerSource, 'string');

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/attendance/preferences`,
    {
      geofenceMode: 'FLAG_ONLY',
      biometricVerificationMode: 'OPTIONAL',
    },
    AH,
  );
  check('write preferences', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/attendance/preferences`);
  check('geofence mode persisted', r.payload?.geofenceMode, 'FLAG_ONLY');
  check('biometric mode persisted', r.payload?.biometricVerificationMode, 'OPTIONAL');

  console.log('\ntenant isolation');
  const slugB = `attb-${Date.now().toString(36)}`;
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
  r = await call(B, 'GET', `/v1/organizations/${orgId}/attendance`);
  check('tenant B cannot read tenant A attendance', r.status, 403);
  r = await call(B, 'GET', `/v1/organizations/${orgId}/attendance/corrections`);
  check('tenant B cannot read tenant A corrections', r.status, 403);
  r = await call(B, 'GET', `/v1/organizations/${orgId}/attendance/preferences`);
  check('tenant B cannot read tenant A policy', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/attendance/check-ins`,
    {
      employeeId,
      occurredAt: new Date().toISOString(),
      workDate,
    },
    BH,
  );
  check('tenant B cannot punch for a tenant A employee', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/attendance/${correctionId}/decision`,
    {
      status: 'REJECTED',
      comment: 'cross-tenant attempt',
    },
    BH,
  );
  check('tenant B cannot decide a tenant A correction', r.status, 403);
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
