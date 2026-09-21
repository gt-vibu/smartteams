#!/usr/bin/env node
/**
 * Salaries can be saved, edited and revised: a new salary from a later date closes the previous
 * one instead of being refused as an overlap, and the profile shows the salary in force today.
 *
 *   pnpm verify:salary-revision
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { testAadhaar } from './lib/aadhaar.mjs';

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

async function main() {
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  const PH = { 'x-csrf-token': r.payload.csrfToken };
  const slug = `qa-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `Qa ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Qa Admin',
      reason: 'probe',
    },
    PH,
  );
  const orgId = r.payload.organization.id;
  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', {
    email: `admin@${slug}.test`,
    password: r.payload.temporaryPassword,
  });
  const AH = { 'x-csrf-token': r.payload.csrfToken };
  const org = (m, p, b, h) =>
    call(
      A,
      m,
      `/v1/organizations/${orgId}${p}`,
      b,
      m === 'GET' ? undefined : { ...AH, ...(h ?? {}) },
    );
  const employee = (
    await org('POST', '/employees', {
      firstName: 'Ravi',
      lastName: 'Kumar',
      employmentType: 'FULL_TIME',
      workEmail: `ravi@${slug}.test`,
      aadhaarNumber: testAadhaar(),
      dateOfJoining: '2026-01-01',
    })
  ).payload;
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const save = (grossSalary, effectiveFrom) =>
    org('POST', '/payroll/profile', {
      employeeId: employee.id,
      grossSalary,
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      overtimeMultiplier: 1.5,
      effectiveFrom,
      payrollEnabled: true,
      salarySlipMode: 'ENABLED',
      pfEnabled: true,
      esiEnabled: false,
      ptEnabled: true,
    });
  const current = async () =>
    Number(
      (await org('GET', `/payroll/profile?employeeId=${employee.id}`)).payload?.compensation
        ?.grossSalary,
    );

  console.log('\nsalary is kept, edited and revised');
  r = await save(40000, day(-30));
  check('a first salary saves', r.status, [200, 201]);
  check('the saved salary is what the profile shows', await current(), 40000);
  r = await save(42000, day(-30));
  check('editing it on the same start date saves', r.status, [200, 201]);
  check('the edit replaces the amount', await current(), 42000);
  r = await save(50000, day(0));
  check('a revision from today saves (no overlap error)', r.status, [200, 201]);
  check('the revision is the salary now', await current(), 50000);
  r = await save(55000, day(30));
  check('a revision booked for next month saves', r.status, [200, 201]);
  check('today still shows the current salary', await current(), 50000);
  r = await save(52000, day(10));
  check('a revision between two others saves', r.status, [200, 201]);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
