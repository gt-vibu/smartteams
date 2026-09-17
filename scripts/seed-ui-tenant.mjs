#!/usr/bin/env node
/**
 * Creates a throwaway tenant with enough real data to exercise the UI, and prints its sign-in
 * details.
 *
 * Every screen behaves differently with an empty tenant than with a populated one — an org chart
 * of nobody, a directory of nobody and a holiday list of nothing all render their empty states,
 * which is exactly the case that does *not* need looking at. This creates the populated case.
 *
 * Nothing here is a fixture: every record below is written through the same API the product uses,
 * so what the screens then show is genuinely server state.
 *
 *   node scripts/seed-ui-tenant.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  if (r.status >= 400) console.log(`  ! ${method} ${path} -> ${r.status}`, JSON.stringify(payload));
  return { status: r.status, payload };
}

const PEOPLE = [
  { n: 'MGR-001', f: 'Kavita', l: 'Joshi', title: 'Head of Engineering', dept: 'Engineering' },
  { n: 'EMP-101', f: 'Asha', l: 'Rao', title: 'Backend Engineer', dept: 'Engineering' },
  { n: 'EMP-102', f: 'Bala', l: 'Subramanian', title: 'Frontend Engineer', dept: 'Engineering' },
  { n: 'EMP-103', f: 'Nikhil', l: 'Menon', title: 'Product Designer', dept: 'Product & Design' },
  { n: 'EMP-104', f: 'Swati', l: 'Pande', title: 'Growth Analyst', dept: 'Marketing & Growth' },
  { n: 'EMP-105', f: 'Rohan', l: 'Das', title: 'Data Engineer', dept: 'Engineering' },
];

async function main() {
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  if (r.status !== 201) throw new Error('platform login failed');
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const slug = `uicheck-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: 'Northwind Labs',
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'Northwind Admin',
      reason: 'UI verification tenant',
    },
    PH,
  );
  const orgId = r.payload.organization.id;
  const email = `admin@${slug}.test`;
  const password = r.payload.temporaryPassword;

  const A = jar();
  const login = await call(A, 'POST', '/v1/auth/login', { email, password });
  const H = { 'x-csrf-token': login.payload.csrfToken };
  const org = (method, path, body) =>
    call(A, method, `/v1/organizations/${orgId}${path}`, body, method === 'GET' ? undefined : H);

  r = await org('GET', '/branches');
  const branchId = (r.payload ?? [])[0]?.id;

  // A second branch, so the branch list is not a list of one.
  await org('POST', '/branches', { name: 'Bengaluru', code: 'BLR' });

  console.log('people');
  const ids = {};
  for (const person of PEOPLE) {
    const created = await org('POST', '/employees', {
      employeeNumber: person.n,
      firstName: person.f,
      lastName: person.l,
      workEmail: `${person.f.toLowerCase()}@${slug}.test`,
      phone: '+91 90000 00000',
      employmentType: 'FULL_TIME',
      dateOfJoining: '2025-06-01',
      ...(branchId ? { primaryBranchId: branchId } : {}),
    });
    ids[person.n] = created.payload?.id;
    console.log(`  ${person.n} ${created.status}`);
  }

  console.log('employment records and reporting line');
  for (const person of PEOPLE) {
    const id = ids[person.n];
    if (!id) continue;
    await org('POST', `/employees/${id}/employment-records`, {
      jobTitle: person.title,
      department: person.dept,
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      effectiveFrom: '2025-06-01',
      ...(person.n === 'MGR-001' ? {} : { managerEmployeeId: ids['MGR-001'] }),
    });
    // The live pointer approvals resolve against, separate from the historical record above.
    if (person.n !== 'MGR-001')
      await org('PUT', `/employees/${id}/manager`, { managerEmployeeId: ids['MGR-001'] });
  }

  console.log('holidays');
  for (const [date, name] of [
    ['2026-10-02', 'Gandhi Jayanti'],
    ['2026-10-20', 'Deepavali'],
    ['2026-12-25', 'Christmas'],
  ]) {
    const h = await org('POST', '/holidays', { holidayDate: date, name });
    console.log(`  ${name} ${h.status}`);
  }

  console.log('teams and projects');
  await org('POST', '/teams', { name: 'Platform' });
  await org('POST', '/projects', {
    code: 'NW-2026',
    name: 'Northwind Rebuild',
    startDate: '2026-01-05',
  });

  console.log('\n--- sign in ---');
  console.log(`email    ${email}`);
  /*
   * The password goes to a gitignored file, not to stdout.
   *
   * Printing it was convenient and wrong: this runs in terminals that get screen-shared and in
   * shells whose scrollback is kept, and CodeQL flags it as clear-text logging of a credential.
   * The file carries the same convenience without leaving a live password where it can be copied
   * by accident.
   */
  const credentialsPath = resolve(ROOT, '.seed-credentials.local');
  writeFileSync(
    credentialsPath,
    `email=${email}
password=${password}
organizationId=${orgId}
`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
  console.log(`password written to ${credentialsPath} (gitignored)`);
  console.log(`org      ${orgId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
