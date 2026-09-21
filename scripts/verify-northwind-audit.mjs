import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:4000';

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

async function runNorthwindAudit() {
  console.log('================================================================');
  console.log('       NORTHWIND LABS COMPREHENSIVE QA & PERMISSION AUDIT       ');
  console.log('================================================================\n');

  const credsRaw = readFileSync(resolve(ROOT, '.seed-credentials.local'), 'utf8');
  const orgMatch = credsRaw.match(/# Organization ID: ([a-f0-9-]+)/);
  const adminEmailMatch = credsRaw.match(/\[ADMIN\]\s*\nemail=([^\r\n]+)/);
  const adminPwMatch = credsRaw.match(/password=([^\r\n]+)/);

  if (!orgMatch || !adminEmailMatch || !adminPwMatch) {
    throw new Error('Failed to parse .seed-credentials.local');
  }

  const orgId = orgMatch[1];
  const adminEmail = adminEmailMatch[1];
  const adminPassword = adminPwMatch[1];
  const empEmail = 'asha@northwind-mu6t7add.test';
  const empPassword = adminPassword;

  console.log(`Target Tenant:  ${orgId}`);
  console.log(`Admin User:     ${adminEmail}`);
  console.log(`Employee User:  ${empEmail}\n`);

  let passCount = 0;
  let failCount = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`  [PASS] ${title} ${extra ? '(' + extra + ')' : ''}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${title} ${extra ? '(' + extra + ')' : ''}`);
      failCount++;
    }
  }

  // 1. ADMIN FLOW
  console.log('--- Phase 1: Admin Authentication & Permissions ---');
  const adminJar = jar();
  let r = await call(adminJar, 'POST', '/v1/auth/login', {
    email: adminEmail,
    password: adminPassword,
  });
  assert('Admin login succeeds with 201', r.status === 201);
  const adminCsrf = r.payload?.csrfToken;
  const adminHeaders = { 'x-csrf-token': adminCsrf };
  const adminOrg = (m, p, b, extra) => call(adminJar, m, `/v1/organizations/${orgId}${p}`, b, { ...(m === 'GET' ? {} : adminHeaders), ...(extra ?? {}) });

  // Read employees list as Admin
  r = await adminOrg('GET', '/employees');
  const employees = r.payload?.items ?? r.payload ?? [];
  assert('Admin can read employee list', r.status === 200 && Array.isArray(employees));
  console.log(`    Total employees found: ${employees.length}`);
  const asha = employees.find((e) => e.workEmail === empEmail || e.firstName === 'Asha');
  const kavita = employees.find((e) => e.firstName === 'Kavita');

  // Test duplicate hire prevention
  console.log('\n--- Phase 2: Duplicate Data & Validation Checks (Admin) ---');
  r = await adminOrg('POST', '/employees', {
    firstName: 'Asha',
    lastName: 'Rao',
    workEmail: empEmail,
    employmentType: 'FULL_TIME',
    aadhaarNumber: '999911112222',
  });
  assert('Duplicate work email is blocked with 409', r.status === 409, r.payload?.detail);

  r = await adminOrg('POST', '/employees', {
    firstName: 'Asha',
    lastName: 'Rao',
    workEmail: `  ${empEmail.toUpperCase()}  `,
    employmentType: 'FULL_TIME',
    aadhaarNumber: '999911112222',
  });
  assert('Duplicate work email with casing/spaces is blocked with 409', r.status === 409, r.payload?.detail);

  if (asha) {
    r = await adminOrg('POST', '/employees', {
      employeeNumber: asha.employeeNumber,
      firstName: 'Clone',
      lastName: 'User',
      workEmail: 'clone.asha@northwind.test',
      employmentType: 'FULL_TIME',
      aadhaarNumber: '999911113333',
    });
    assert('Duplicate employee number is blocked with 409', r.status === 409, r.payload?.detail);
  }

  // Edit employee as Admin
  console.log('\n--- Phase 3: Employee Editability (Admin) ---');
  if (asha) {
    const currentAsha = await adminOrg('GET', `/employees/${asha.id}`);
    const v = currentAsha.payload?.version ?? 1;
    const originalPhone = currentAsha.payload?.phone || '+91 90000 00000';
    const newPhone = '+91 98888 77777';

    r = await adminOrg('PATCH', `/employees/${asha.id}`, {
      phone: newPhone,
      firstName: asha.firstName,
      lastName: asha.lastName,
    }, { 'if-match-version': String(v) });
    assert('Admin can edit employee profile (200 OK)', r.status === 200, `Version ${v} -> Status ${r.status}`);

    // Read back fresh
    r = await adminOrg('GET', `/employees/${asha.id}`);
    assert('Employee edit persists upon refetch', r.payload?.phone === newPhone);

    // Restore
    const updatedVersion = r.payload?.version ?? (v + 1);
    await adminOrg('PATCH', `/employees/${asha.id}`, {
      phone: originalPhone,
      firstName: asha.firstName,
      lastName: asha.lastName,
    }, { 'if-match-version': String(updatedVersion) });
  }

  // Projects CRUD & Membership (Admin)
  console.log('\n--- Phase 4: Projects & Duplicate Member Assignment ---');
  r = await adminOrg('GET', '/projects');
  const projects = r.payload?.items ?? r.payload ?? [];
  assert('Admin can read projects list', r.status === 200 && Array.isArray(projects));
  const nwProject = projects[0];

  if (nwProject && asha) {
    // Attempt duplicate project member assignment
    r = await adminOrg('POST', `/projects/${nwProject.id}/members`, {
      employeeId: asha.id,
      projectRole: 'Backend Engineer',
      startsOn: '2026-01-05',
    });
    assert('Assigning same employee twice to same project is blocked with 409', r.status === 409, r.payload?.detail);
  }

  // 2. EMPLOYEE FLOW
  console.log('\n--- Phase 5: Employee Authentication & Scope Boundary ---');
  const empJar = jar();
  r = await call(empJar, 'POST', '/v1/auth/login', {
    email: empEmail,
    password: empPassword,
  });
  assert('Employee login succeeds with 201', r.status === 201);
  const empCsrf = r.payload?.csrfToken;
  const empHeaders = { 'x-csrf-token': empCsrf };
  const empOrg = (m, p, b, extra) => call(empJar, m, `/v1/organizations/${orgId}${p}`, b, { ...(m === 'GET' ? {} : empHeaders), ...(extra ?? {}) });

  // Employee reading own profile vs colleague profile
  console.log('\n--- Phase 6: Employee Data Privacy & RBAC ---');
  if (asha) {
    r = await empOrg('GET', `/employees/${asha.id}`);
    assert('Employee can read their own employee profile', r.status === 200);
  }
  if (kavita) {
    r = await empOrg('GET', `/employees/${kavita.id}`);
    assert('Employee CANNOT read colleague profile (blocked)', r.status === 403 || r.status === 409, `Status ${r.status}`);

    r = await empOrg('PATCH', `/employees/${kavita.id}`, { phone: '+91 99999 99999' }, { 'if-match-version': '1' });
    assert('Employee CANNOT edit colleague profile (403 Forbidden)', r.status === 403);
  }

  // Employee project visibility
  console.log('\n--- Phase 7: Employee Project Visibility ---');
  r = await empOrg('GET', '/projects');
  assert('Employee can request projects endpoint', r.status === 200);
  const empProjects = r.payload?.items ?? r.payload ?? [];
  console.log(`    Projects visible to employee: ${empProjects.length}`);
  if (nwProject) {
    assert('Employee sees project they are assigned to', empProjects.some((p) => p.id === nwProject.id));
  }

  // Employee cannot create a project
  r = await empOrg('POST', '/projects', {
    name: 'Unauthorized Project',
    code: 'UNAUTH-01',
    startDate: '2026-03-01',
  });
  assert('Employee cannot create a project (403 Forbidden)', r.status === 403);

  // Attendance & Timecard for Employee
  console.log('\n--- Phase 8: Attendance & Personal Presence (Employee) ---');
  r = await empOrg('GET', '/attendance/my-presence');
  assert('Employee can fetch personal presence status', r.status === 200 || r.status === 404);

  // Leave balance & application
  console.log('\n--- Phase 9: Leave Lifecycle (Employee) ---');
  r = await empOrg('GET', '/leave/balances');
  assert('Employee can fetch leave balances', r.status === 200);

  // Directory (Employee view)
  console.log('\n--- Phase 10: Employee Directory Access ---');
  r = await empOrg('GET', '/employees/directory');
  assert('Employee can access directory', r.status === 200);

  console.log('\n================================================================');
  console.log(`RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) process.exit(1);
}

runNorthwindAudit().catch((e) => {
  console.error('Audit execution error:', e);
  process.exit(1);
});
