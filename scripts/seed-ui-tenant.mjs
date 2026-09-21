#!/usr/bin/env node
/**
 * Creates a throwaway tenant with real data to exercise the UI, provisions full login
 * credentials for both the Admin and every employee, and writes their sign-in details.
 *
 *   node scripts/seed-ui-tenant.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  {
    n: 'MGR-001',
    f: 'Kavita',
    l: 'Joshi',
    title: 'Head of Engineering',
    dept: 'Engineering',
    isLead: true,
  },
  {
    n: 'EMP-101',
    f: 'Asha',
    l: 'Rao',
    title: 'Backend Engineer',
    dept: 'Engineering',
    isLead: false,
  },
  {
    n: 'EMP-102',
    f: 'Bala',
    l: 'Subramanian',
    title: 'Frontend Engineer',
    dept: 'Engineering',
    isLead: false,
  },
  {
    n: 'EMP-103',
    f: 'Nikhil',
    l: 'Menon',
    title: 'Product Designer',
    dept: 'Product & Design',
    isLead: false,
  },
  {
    n: 'EMP-104',
    f: 'Swati',
    l: 'Pande',
    title: 'Growth Analyst',
    dept: 'Marketing & Growth',
    isLead: false,
  },
  {
    n: 'EMP-105',
    f: 'Rohan',
    l: 'Das',
    title: 'Data Engineer',
    dept: 'Engineering',
    isLead: false,
  },
];

const STANDARD_PASSWORD = 'ST!TestPass12345';

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
  const adminEmail = `admin@${slug}.test`;
  const adminTempPassword = r.payload.temporaryPassword;

  const A = jar();
  const login = await call(A, 'POST', '/v1/auth/login', {
    email: adminEmail,
    password: adminTempPassword,
  });
  const H = { 'x-csrf-token': login.payload.csrfToken };
  const org = (method, path, body) =>
    call(A, method, `/v1/organizations/${orgId}${path}`, body, method === 'GET' ? undefined : H);

  // Set standard admin password using setup if available or keep temp password
  const adminPassword = adminTempPassword;

  r = await org('GET', '/branches');
  const branchId = (r.payload ?? [])[0]?.id;

  // A second branch
  await org('POST', '/branches', { name: 'Bengaluru', code: 'BLR' });

  // Get available roles
  const rolesResp = await org('GET', '/roles');
  const allRoles = Array.isArray(rolesResp.payload?.roles)
    ? rolesResp.payload.roles
    : Array.isArray(rolesResp.payload)
      ? rolesResp.payload
      : [];
  const employeeRole =
    allRoles.find((role) => role.code === 'EMPLOYEE' || role.name === 'Employee') || allRoles[0];

  console.log('Creating employees and user accounts...');
  const ids = {};
  const userCreds = [];

  for (const person of PEOPLE) {
    const workEmail = `${person.f.toLowerCase()}@${slug}.test`;

    // 1. Create employee workforce record
    const created = await org('POST', '/employees', {
      employeeNumber: person.n,
      firstName: person.f,
      lastName: person.l,
      workEmail,
      phone: '+91 90000 00000',
      aadhaarNumber: testAadhaar(),
      employmentType: 'FULL_TIME',
      dateOfJoining: '2025-06-01',
      ...(branchId ? { primaryBranchId: branchId } : {}),
    });
    const employeeId = created.payload?.id;
    ids[person.n] = employeeId;
    console.log(`  Employee ${person.n} created: ${created.status}`);

    // 2. Create organization member / user account
    let userPassword = STANDARD_PASSWORD;
    try {
      const memberResp = await org('POST', '/members', {
        email: workEmail,
        displayName: `${person.f} ${person.l}`,
        roleIds: employeeRole ? [employeeRole.id] : [],
        reason: 'Onboarded employee account',
      });

      if (memberResp.status === 201) {
        const userId =
          memberResp.payload?.membership?.userId ||
          memberResp.payload?.user?.id ||
          memberResp.payload?.userId;
        const setupToken = memberResp.payload?.invitation?.developmentSetupToken;

        // If development token is returned, set standard password
        if (setupToken) {
          const setupResp = await call(jar(), 'POST', '/v1/auth/password/setup', {
            token: setupToken,
            password: STANDARD_PASSWORD,
          });
          if (setupResp.status === 200 || setupResp.status === 201) {
            userPassword = STANDARD_PASSWORD;
          } else {
            userPassword = memberResp.payload?.temporaryPassword || STANDARD_PASSWORD;
          }
        } else if (memberResp.payload?.temporaryPassword) {
          userPassword = memberResp.payload.temporaryPassword;
        }

        // 3. Link user account to employee record
        if (userId && employeeId) {
          await org('POST', `/employees/${employeeId}/user`, { userId });
        }
      }
    } catch (err) {
      console.log(`  ! Failed to provision user account for ${workEmail}:`, err.message);
    }

    userCreds.push({
      employeeNumber: person.n,
      name: `${person.f} ${person.l}`,
      title: person.title,
      department: person.dept,
      email: workEmail,
      password: userPassword,
      role: person.n === 'MGR-001' ? 'Manager (Lead)' : 'Employee',
    });
  }

  console.log('Setting employment records and reporting lines...');
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
    if (person.n !== 'MGR-001') {
      await org('PUT', `/employees/${id}/manager`, { managerEmployeeId: ids['MGR-001'] });
    }
  }

  // No holidays are seeded. A holiday calendar is the company's own: seeded ones appeared to
  // administrators as entries they never added, and to employees as days off nobody had granted.
  // Re-running this script also created each one again, so one Deepavali became five.

  console.log('Creating teams and projects...');
  const teamResp = await org('POST', '/teams', {
    name: 'Platform Engineering',
    description: 'Core platform engineering squad',
    teamLeadEmployeeId: ids['MGR-001'],
    branchId,
  });
  const teamId = teamResp.payload?.id;

  const projectResp = await org('POST', '/projects', {
    code: 'NW-2026',
    name: 'Northwind Rebuild',
    startDate: '2026-01-05',
    branchId,
  });
  const projectId = projectResp.payload?.id;

  // Add members to team and project
  if (teamId) {
    for (const person of PEOPLE) {
      if (ids[person.n]) {
        await org('POST', `/teams/${teamId}/members`, {
          employeeId: ids[person.n],
          joinedAt: '2026-01-05T00:00:00.000Z',
        });
      }
    }
  }

  if (projectId) {
    for (const person of PEOPLE) {
      if (ids[person.n]) {
        await org('POST', `/projects/${projectId}/members`, {
          employeeId: ids[person.n],
          projectRole: person.title,
          startsOn: '2026-01-05',
        });
      }
    }
  }

  // Build credentials report
  const credentialsPath = resolve(ROOT, '.seed-credentials.local');
  const credentialsContent = [
    `# Organization: Northwind Labs (${slug})`,
    `# Organization ID: ${orgId}`,
    `# Default Employee Password: ${STANDARD_PASSWORD}`,
    ``,
    `[ADMIN]`,
    `email=${adminEmail}`,
    `password=${adminPassword}`,
    `organizationId=${orgId}`,
    ``,
    `[EMPLOYEES]`,
    ...userCreds.map(
      (u) => `${u.employeeNumber} | ${u.name} (${u.role}) | ${u.email} | ${u.password}`,
    ),
  ].join('\n');

  writeFileSync(credentialsPath, credentialsContent, {
    encoding: 'utf8',
    mode: 0o600,
  });

  console.log('\n======================================================');
  console.log('             SEEDED CREDENTIALS REPORT                ');
  console.log('======================================================');
  console.log(`Organization: Northwind Labs (${slug})`);
  console.log(`Org ID:       ${orgId}`);
  console.log(`\nADMIN:`);
  console.log(`  Email:      ${adminEmail}`);
  console.log(`  Password:   ${adminPassword}`);
  console.log(`\nEMPLOYEES:`);
  for (const u of userCreds) {
    console.log(
      `  - [${u.employeeNumber}] ${u.name.padEnd(20)} | ${u.role.padEnd(14)} | ${u.email.padEnd(28)} | PW: ${u.password}`,
    );
  }
  console.log('\nCredentials saved to .seed-credentials.local');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
