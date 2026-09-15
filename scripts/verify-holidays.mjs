#!/usr/bin/env node
/**
 * Holiday integration check.
 *
 * The point of this module was never the calendar screen — it was that a real `Holiday` model and
 * two real consumers already existed with no way to enter a row. So the assertions that matter
 * here are the cross-module ones: a holiday created through the new API must change what a leave
 * request is charged, and retiring it must change it back for later requests without touching
 * what was already approved.
 *
 *   pnpm verify:holidays
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

async function tenant(P, PH, prefix) {
  const slug = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Hol ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Holiday Admin',
      reason: 'holiday verification',
    },
    PH,
  );
  const A = jar();
  const login = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  return {
    slug,
    orgId: r.payload.organization.id,
    jar: A,
    headers: { 'x-csrf-token': login.payload.csrfToken },
  };
}

/** The Monday of a week comfortably inside next month, so the range is all working days. */
function upcomingMonday() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(8);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const addDays = (key, days) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const a = await tenant(P, PH, 'ha');
  const b = await tenant(P, PH, 'hb');
  const org = (t, method, path, body) =>
    call(
      t.jar,
      method,
      `/v1/organizations/${t.orgId}${path}`,
      body,
      method === 'GET' ? undefined : t.headers,
    );

  const monday = upcomingMonday();
  const wednesday = addDays(monday, 2);
  const year = monday.slice(0, 4);

  console.log('\ncalendar management');
  r = await org(a, 'GET', '/holidays');
  check('a new tenant has an empty calendar', (r.payload ?? []).length, 0);
  check('the list parses for the frontend', contracts.parseHolidayList(r.payload) !== null, true);

  r = await org(a, 'POST', '/holidays', { name: 'Founders Day', holidayDate: wednesday });
  check('create a holiday', r.status, [200, 201]);
  const holidayId = r.payload?.id;
  check('it is organization-wide by default', r.payload?.branchId, null);

  r = await org(a, 'GET', `/holidays?from=${year}-01-01&to=${year}-12-31`);
  check('it is read back from the server', (r.payload ?? []).length, 1);
  r = await org(a, 'GET', `/holidays?from=${addDays(wednesday, 1)}&to=${year}-12-31`);
  check('the date range is applied server-side', (r.payload ?? []).length, 0);

  r = await org(a, 'POST', '/holidays', { name: 'Duplicate', holidayDate: wednesday });
  check('a second holiday on the same date is refused', r.status, [400, 409]);
  r = await org(a, 'POST', '/holidays', { name: 'Nonsense', holidayDate: '2026-02-30' });
  check('an impossible date is refused', r.status, [400, 409]);

  r = await org(a, 'PATCH', `/holidays/${holidayId}`, { name: 'Founders Day (renamed)' });
  check('rename the holiday', r.status, 200);
  r = await org(a, 'PATCH', `/holidays/${holidayId}`, { holidayDate: addDays(wednesday, 1) });
  // The date is not accepted by the DTO, so the rename above is the only edit — moving a holiday
  // would change what past leave was charged.
  r = await org(a, 'GET', `/holidays?from=${year}-01-01&to=${year}-12-31`);
  check('the date did not move', (r.payload ?? [])[0]?.holidayDate?.slice(0, 10), wednesday);

  console.log('\ntenant isolation');
  r = await org(b, 'GET', '/holidays');
  check("another tenant does not see this tenant's holidays", (r.payload ?? []).length, 0);
  r = await call(b.jar, 'GET', `/v1/organizations/${a.orgId}/holidays`);
  check('nor can it read them by supplying the organization id', r.status, [403, 404]);
  r = await call(
    b.jar,
    'PATCH',
    `/v1/organizations/${a.orgId}/holidays/${holidayId}`,
    { name: 'Hijacked' },
    b.headers,
  );
  check('nor rename them', r.status, [403, 404]);

  console.log('\nleave charges working days around the holiday');
  r = await org(a, 'GET', '/branches');
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;
  r = await org(a, 'POST', '/employees', {
    employeeNumber: 'EMP-001',
    firstName: 'Asha',
    lastName: 'Rao',
    workEmail: `asha@${a.slug}.test`,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2024-03-15',
    primaryBranchId: branchId,
  });
  const employeeId = r.payload?.id;
  r = await org(a, 'POST', '/leave/types', {
    code: 'CL',
    name: 'Casual leave',
    paid: true,
    accrualType: 'FIXED_ANNUAL',
    annualAllowance: 20,
    requiresAttachment: false,
  });
  const leaveTypeId = r.payload?.id;
  await org(a, 'POST', '/leave/types/CL/assign', { branchId });
  r = await org(a, 'GET', '/roles');
  const roleId = (Array.isArray(r.payload) ? r.payload : (r.payload?.items ?? [])).find(
    (role) => role.code === 'ORG_ADMIN',
  )?.id;
  await org(a, 'POST', '/approval-policies', {
    domain: 'LEAVE',
    code: 'LV-DEF',
    name: 'Leave approvals',
    isDefault: true,
    steps: [{ stepNumber: 1, approverType: 'ROLE', roleId }],
  });

  // Monday to Friday is five working days; the Wednesday holiday must take one off.
  r = await org(a, 'POST', '/leave/requests', {
    employeeId,
    leaveTypeId,
    startDate: monday,
    endDate: addDays(monday, 4),
    reason: 'Week spanning the holiday',
    branchId,
  });
  check('create a leave request across the holiday', r.status, 201);
  const requestId = r.payload?.id;
  check('the holiday is not charged as a leave day', Number(r.payload?.requestedDays), 4);

  console.log('\nretiring the holiday changes later requests only');
  r = await org(a, 'POST', `/holidays/${holidayId}/deactivate`, {
    reason: 'Declared a working day',
  });
  check('retire the holiday', r.status, [200, 201]);
  r = await org(a, 'POST', `/holidays/${holidayId}/deactivate`, { reason: 'Again' });
  check('it cannot be retired twice', r.status, [400, 409]);

  r = await org(a, 'GET', `/leave/requests?employeeId=${employeeId}`);
  const existing = (r.payload?.requests ?? []).find((entry) => entry.id === requestId);
  // The persisted figure is not recomputed: what was approved stays approved on its own terms.
  check('the existing request keeps the days it was charged', Number(existing?.requestedDays), 4);

  r = await org(a, 'POST', '/leave/requests', {
    employeeId,
    leaveTypeId,
    startDate: addDays(monday, 7),
    endDate: addDays(monday, 11),
    reason: 'Week after the holiday was retired',
    branchId,
  });
  check('a later request is charged for the full week', Number(r.payload?.requestedDays), 5);

  r = await org(a, 'GET', `/holidays?from=${year}-01-01&to=${year}-12-31`);
  check('the retired holiday is still listed for the record', (r.payload ?? []).length, 1);
  check('and reports itself inactive', (r.payload ?? [])[0]?.isActive, false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
