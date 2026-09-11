#!/usr/bin/env node
/**
 * Teams and projects integration check.
 *
 * Exercises the endpoints the teams and projects screens depend on against a live API:
 * creation, membership add and end, archival, and tenant isolation on each.
 *
 *   pnpm verify:teams
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

async function main() {
  console.log('setup');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  const PH = { 'x-csrf-token': r.payload.csrfToken };

  const slug = `tp-${Date.now().toString(36)}`;
  r = await call(
    P,
    'POST',
    '/v1/organizations/onboard',
    {
      name: `TP ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      adminEmail: `admin@${slug}.test`,
      adminDisplayName: 'TP Admin',
      reason: 'teams and projects verification',
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

  console.log('\nbranches feed the team and project forms');
  r = await call(A, 'GET', `/v1/organizations/${orgId}/branches`);
  check('GET branches', r.status, 200);
  const branchId = Array.isArray(r.payload) ? r.payload[0]?.id : undefined;

  console.log('\nteam lifecycle');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams`,
    {
      name: 'Platform Core',
      description: 'Core platform squad',
      ...(branchId ? { branchId } : {}),
      teamLeadEmployeeId: employeeId,
    },
    AH,
  );
  check('create team with lead and branch', r.status, 201);
  const teamId = r.payload?.id;
  check('teamLeadEmployeeId is returned', r.payload?.teamLeadEmployeeId, employeeId);

  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check('team list', r.status, 200);
  check(
    'list carries teamLeadEmployeeId the roster needs',
    (r.payload?.items ?? r.payload)?.[0]?.teamLeadEmployeeId,
    employeeId,
  );
  check(
    'list carries branchId the roster needs',
    (r.payload?.items ?? r.payload)?.[0]?.branchId ?? null,
    branchId ?? null,
  );

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members`,
    {
      employeeId,
      joinedAt: '2026-01-01',
    },
    AH,
  );
  check('add team member', r.status, 201);
  const memberId = r.payload?.id;

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}/end`,
    {
      leftAt: '2026-06-30',
    },
    AH,
  );
  check('end team member', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check(
    'ended member is retained, not deleted',
    (r.payload?.items ?? r.payload)?.[0]?.members?.length,
    1,
  );

  console.log('\nteam archival (newly surfaced in the UI)');
  r = await call(A, 'POST', `/v1/organizations/${orgId}/teams/${teamId}/archive`, {}, AH);
  check('archive without a reason is rejected', r.status, [400, 409]);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/archive`,
    {
      reason: 'Squad merged into Platform',
    },
    AH,
  );
  check('archive with a reason succeeds', r.status, 201);
  r = await call(A, 'GET', `/v1/organizations/${orgId}/teams`);
  check(
    'archived team leaves the active list',
    Array.isArray(r.payload?.items ?? r.payload)
      ? (r.payload?.items ?? r.payload ?? []).length
      : -1,
    0,
  );

  console.log('\nproject lifecycle');
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects`,
    {
      code: 'VER-1',
      name: 'Verification',
      ...(branchId ? { branchId } : {}),
      startDate: '2026-01-01',
    },
    AH,
  );
  check('create project', r.status, 201);
  const projectId = r.payload?.id;

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members`,
    {
      employeeId,
      projectRole: 'Lead',
      allocationPercentage: 60,
      startsOn: '2026-01-01',
    },
    AH,
  );
  check('allocate to project', r.status, 201);
  const projectMemberId = r.payload?.id;

  r = await call(A, 'GET', `/v1/organizations/${orgId}/projects`);
  check(
    'project list carries branchId',
    (r.payload?.items ?? r.payload)?.[0]?.branchId ?? null,
    branchId ?? null,
  );
  check(
    'project list carries the role',
    (r.payload?.items ?? r.payload)?.[0]?.members?.[0]?.projectRole,
    'Lead',
  );
  check(
    'project list carries the allocation',
    Number((r.payload?.items ?? r.payload)?.[0]?.members?.[0]?.allocationPercentage),
    60,
  );

  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/members/${projectMemberId}/end`,
    {
      endsOn: '2026-09-30',
    },
    AH,
  );
  check('end allocation', r.status, 201);
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/archive`,
    {
      reason: 'Project completed',
    },
    AH,
  );
  check('archive project', r.status, 201);

  console.log('\ntenant isolation');
  const slugB = `tpb-${Date.now().toString(36)}`;
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
  r = await call(B, 'GET', `/v1/organizations/${orgId}/teams`);
  check('tenant B cannot list tenant A teams', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/teams/${teamId}/archive`,
    { reason: 'cross-tenant attempt' },
    BH,
  );
  check('tenant B cannot archive tenant A team', r.status, 403);
  r = await call(
    B,
    'POST',
    `/v1/organizations/${orgId}/projects/${projectId}/archive`,
    { reason: 'cross-tenant attempt' },
    BH,
  );
  check('tenant B cannot archive tenant A project', r.status, 403);
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
