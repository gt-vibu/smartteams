#!/usr/bin/env node
/**
 * A company is onboarded and ten people are hired, each with their own login, then everything a
 * real person might do wrong, twice, or out of turn is tried: duplicate identities in every
 * spelling, edits that collide, projects and teams joined twice or at once, one employee reading
 * another's records, and a second company reaching into the first.
 *
 *   pnpm verify:product-audit
 */
import { testAadhaar } from './lib/aadhaar.mjs';
import {
  call,
  finish,
  good,
  jar,
  ok,
  refused,
  rows,
  signIn,
  tenant,
} from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const A = await tenant('qa');
const B = await tenant('qb');
const employeeRole = A.roles.find((role) => role.code === 'EMPLOYEE').id;
const slug = Date.now().toString(36);

console.log('\nHiring ten people');
const names = ['Asha', 'Bala', 'Chitra', 'Dev', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jay'];
const staff = [];
for (const [index, firstName] of names.entries()) {
  const email = `${firstName.toLowerCase()}.${slug}@apex.test`;
  const created = await A.org('POST', '/employees', {
    firstName,
    lastName: 'Kumar',
    workEmail: email,
    aadhaarNumber: testAadhaar(),
    employmentType: index === 9 ? 'INTERN' : 'FULL_TIME',
    dateOfJoining: '2026-01-05',
  });
  const member = await A.org('POST', '/members', {
    email,
    displayName: firstName + ' Kumar',
    roleIds: [employeeRole],
    reason: 'product audit hire',
  });
  const linked = await A.org('POST', `/employees/${created.payload?.id}/user`, {
    userId: member.payload?.userId,
  });
  await A.org('POST', `/employees/${created.payload?.id}/branches`, {
    branchId: A.branchId,
    startsOn: '2026-01-05',
    isPrimary: true,
  });
  const cookies = jar();
  const csrf = await signIn(cookies, email, member.payload?.temporaryPassword);
  staff.push({
    ...created.payload,
    email,
    password: member.payload?.temporaryPassword,
    as: (method, path, body) =>
      call(
        cookies,
        method,
        `/v1/organizations/${A.orgId}${path}`,
        body,
        method === 'GET' ? undefined : csrf,
      ),
  });
  if (!good(created) || !good(linked))
    console.log('   hire failed:', firstName, status(created), status(linked));
}
const numbers = staff.map((e) => e.employeeNumber);
ok(
  'ten people hired, each with a login',
  staff.filter((e) => e.id).length === 10,
  numbers.join(','),
);
ok(
  'employee IDs are generated and unique',
  new Set(numbers).size === 10 && numbers.every((n) => /^EMP\d{3}$/.test(n)),
  numbers.join(','),
);
const [asha, bala, chitra, dev] = staff;
// The harness hires two people of its own, so counts are measured from here.
const headcount = async () => rows((await A.org('GET', '/employees')).payload).length;
const baseline = await headcount();

console.log('\nThe same person cannot be hired twice, in any spelling');
const hire = (overrides) =>
  A.org('POST', '/employees', {
    firstName: 'Dup',
    lastName: 'Person',
    employmentType: 'FULL_TIME',
    aadhaarNumber: testAadhaar(),
    ...overrides,
  });
for (const [label, email] of [
  ['same email', asha.email],
  ['same email in capitals', asha.email.toUpperCase()],
  ['same email with spaces around it', `  ${asha.email}  `],
]) {
  const r = await hire({ workEmail: email });
  ok(
    `${label} is refused with a reason`,
    r.status === 409 && Boolean(r.payload?.detail),
    status(r),
  );
}
let r = await hire({ employeeNumber: asha.employeeNumber.toLowerCase() });
ok('an employee ID already in use (any case) is refused', r.status === 409, status(r));
r = await hire({ firstName: '   ' });
ok(
  'a blank first name is refused with a reason',
  [400, 409].includes(r.status) && Boolean(r.payload?.detail),
  status(r),
);
r = await hire({ workEmail: 'not-an-email' });
ok(
  'an invalid email is refused with a reason',
  [400, 409].includes(r.status) && Boolean(r.payload?.detail),
  status(r),
);
r = await hire({ aadhaarNumber: undefined });
ok('a missing Aadhaar is refused', r.status === 400, status(r));
r = await hire({ dateOfJoining: '2026-02-30' });
ok('an impossible joining date is refused', [400, 409].includes(r.status), status(r));
const afterRefusals = await headcount();
ok(
  'none of the refused hires left a record behind',
  afterRefusals === baseline,
  `${afterRefusals} vs ${baseline}`,
);
const [first, second] = await Promise.all([
  hire({ workEmail: `twin.${slug}@apex.test` }),
  hire({ workEmail: `twin.${slug}@apex.test` }),
]);
ok(
  'a double-clicked hire creates one employee',
  [first.status, second.status].sort().join() === '201,409',
  `${first.status},${second.status}`,
);
if (good(first))
  await A.org('POST', `/employees/${first.payload.id}/deactivate`, {
    reason: 'audit duplicate cleanup',
  });
else if (good(second))
  await A.org('POST', `/employees/${second.payload.id}/deactivate`, {
    reason: 'audit duplicate cleanup',
  });

console.log('\nA different company may use the same email');
r = await B.org('POST', '/employees', {
  firstName: 'Asha',
  lastName: 'Kumar',
  employmentType: 'FULL_TIME',
  workEmail: asha.email,
  aadhaarNumber: testAadhaar(),
});
ok('another company can hire someone with the same email', good(r), status(r));

console.log('\nEditing an employee');
const fresh = (await A.org('GET', `/employees/${bala.id}`)).payload;
const edit = (id, body, version) =>
  A.orgRaw('PATCH', `/employees/${id}`, body, { 'if-match-version': String(version) });
r = await edit(bala.id, { firstName: 'Balaji', phone: '9876543210' }, fresh?.version);
ok('an edit saves', good(r), status(r));
const reread = (await A.org('GET', `/employees/${bala.id}`)).payload;
ok('the edit is there after a fresh read', reread?.firstName === 'Balaji', reread?.firstName);
const afterEdit = await headcount();
ok(
  'editing did not create another employee',
  afterEdit === baseline + 1,
  `${afterEdit} vs ${baseline} + the double-click one`,
);
r = await edit(bala.id, { firstName: 'Stale' }, fresh?.version);
ok(
  'an edit made from an out-of-date copy is refused',
  r.status === 409 || r.status === 412,
  status(r),
);
r = await edit(bala.id, { workEmail: chitra.email.toUpperCase() }, reread?.version);
ok("editing to another employee's email is refused", r.status === 409, status(r));
r = await A.org('PUT', `/employees/${bala.id}/manager`, { managerEmployeeId: bala.id });
ok('an employee cannot be their own manager', r.status === 409 || r.status === 400, status(r));
const outsider = rows((await B.org('GET', '/employees')).payload)[0];
r = await A.org('PUT', `/employees/${bala.id}/manager`, { managerEmployeeId: outsider?.id });
ok(
  'a manager from another company is refused',
  refused(r) || r.status === 400 || r.status === 409,
  status(r),
);
r = await A.org('PUT', `/employees/${bala.id}/manager`, { managerEmployeeId: asha.id });
ok('a colleague can be set as manager', good(r), status(r));
r = await A.org('PUT', `/employees/${asha.id}/manager`, { managerEmployeeId: bala.id });
ok(
  'a reporting loop (each managing the other) is refused',
  r.status === 409 || r.status === 400,
  status(r),
);

console.log('\nProjects');
const project = (await A.org('POST', '/projects', { name: 'Apollo', branchId: A.branchId }))
  .payload;
const hidden = (await A.org('POST', '/projects', { name: 'Hermes', branchId: A.branchId })).payload;
ok(
  'project codes are generated',
  /^PRJ-\d{3}$/.test(project?.code ?? '') && project?.code !== hidden?.code,
  `${project?.code} ${hidden?.code}`,
);
r = await A.org('POST', '/projects', { name: '  ', branchId: A.branchId });
ok(
  'a project without a name is refused with a reason',
  [400, 409].includes(r.status) && Boolean(r.payload?.detail),
  status(r),
);
const join = (projectId, employeeId) =>
  A.org('POST', `/projects/${projectId}/members`, { employeeId, startsOn: '2026-01-05' });
r = await join(project.id, asha.id);
ok('an employee is added to a project', good(r), status(r));
const ashaMembership = r.payload;
r = await join(project.id, asha.id);
ok(
  'adding them again is refused with a reason',
  r.status === 409 && Boolean(r.payload?.detail),
  status(r),
);
const racers = await Promise.all([join(project.id, bala.id), join(project.id, bala.id)]);
ok(
  'two clicks at once add them once',
  racers
    .map((x) => x.status)
    .sort()
    .join() === '201,409',
  racers.map((x) => x.status).join(),
);
r = await A.org('POST', `/projects/${project.id}/members/${ashaMembership?.id}/end`, {
  endsOn: '2026-06-30',
});
ok('a member can be removed', good(r), status(r));
r = await A.org('POST', `/projects/${project.id}/members`, {
  employeeId: asha.id,
  startsOn: '2026-07-01',
});
ok('a removed member can be added back after they left', good(r), status(r));
r = await A.org('POST', `/projects/${project.id}/members`, {
  employeeId: chitra.id,
  startsOn: '2026-09-01',
  endsOn: '2026-08-01',
});
ok(
  'a membership that ends before it starts is refused',
  r.status === 409 || r.status === 400,
  status(r),
);
r = await join(project.id, outsider?.id);
ok('an employee from another company cannot be added', r.status >= 400, status(r));
r = await A.org('GET', `/projects`);
const apollo = rows(r.payload).find((p) => p.id === project.id);
const memberIds = (apollo?.members ?? [])
  .filter((m) => !m.endsOn || m.endsOn >= '2026-09-01')
  .map((m) => m.employeeId);
ok(
  'the member list shows each person once',
  memberIds.length === new Set(memberIds).size,
  memberIds.length + ' current',
);

console.log('\nWho sees which projects');
const seen = rows((await asha.as('GET', '/projects')).payload).map((p) => p.code);
ok('an employee sees the projects they are on', seen.includes(project.code), seen.join(','));
ok('and not the ones they are not on', !seen.includes(hidden.code), seen.join(','));
const nobody = rows((await dev.as('GET', '/projects')).payload);
ok('an employee on no project sees none', nobody.length === 0, nobody.length + ' projects');
r = await dev.as('POST', '/projects', { name: 'Sneaky', branchId: A.branchId });
ok('an employee cannot create a project', refused(r), status(r));
r = await dev.as('POST', `/projects/${project.id}/members`, {
  employeeId: dev.id,
  startsOn: '2026-01-05',
});
ok('an employee cannot add themselves to a project', refused(r), status(r));

console.log('\nTeams');
const team = (
  await A.org('POST', '/teams', {
    name: 'Core',
    teamLeadEmployeeId: chitra.id,
    branchId: A.branchId,
  })
).payload;
ok('a team is created', Boolean(team?.id), team?.code ?? '');
const addToTeam = (employeeId) =>
  A.org('POST', `/teams/${team.id}/members`, { employeeId, joinedAt: '2026-01-05' });
r = await addToTeam(dev.id);
ok('a member joins a team', good(r), status(r));
r = await addToTeam(dev.id);
ok('joining the same team twice is refused', r.status === 409, status(r));

console.log('\nOne employee reading another');
for (const [label, path] of [
  ["a colleague's employee record", `/employees/${bala.id}`],
  ["a colleague's detail", `/employees/${bala.id}/detail`],
  ["a colleague's personal profile", `/employees/${bala.id}/personal-profile`],
  ["a colleague's bank accounts", `/employees/${bala.id}/bank-accounts`],
  ["a colleague's salary", `/payroll/profile?employeeId=${bala.id}`],
]) {
  r = await dev.as('GET', path);
  ok(`an employee cannot read ${label}`, refused(r) || r.status === 409, status(r));
}
r = await dev.as('PATCH', `/employees/${bala.id}`, { firstName: 'Hacked' });
ok(
  'an employee cannot edit a colleague',
  refused(r) || r.status === 428 || r.status === 400,
  status(r),
);
r = await dev.as('GET', `/employees/${dev.id}`);
ok('an employee can read their own record', good(r), status(r));

console.log('\nAnother company reaching in');
for (const [label, path] of [
  ['an employee', `/employees/${asha.id}`],
  ['the employee list', `/employees`],
  ['projects', `/projects`],
  ['a salary', `/payroll/profile?employeeId=${asha.id}`],
]) {
  r = await call(B.cookies, 'GET', `/v1/organizations/${A.orgId}${path}`);
  ok(`another company's admin cannot read ${label}`, refused(r) || r.status === 401, status(r));
}
r = await B.org('GET', `/employees/${asha.id}`);
ok(
  "another company's admin cannot reach an employee by id through their own company",
  refused(r),
  status(r),
);

console.log('\nLeaving the company');
r = await A.org('POST', `/employees/${dev.id}/deactivate`, { reason: 'audit: resigned' });
ok('an employee can be deactivated', good(r), status(r));
r = await dev.as('GET', `/employees/${dev.id}`);
ok('their open session stops working', r.status === 401 || refused(r), status(r));
const again = jar();
r = await call(again, 'POST', '/v1/auth/login', { email: dev.email, password: dev.password });
ok('they cannot sign in again', r.status >= 400, status(r));
r = await join(project.id, dev.id);
ok('a deactivated employee cannot be put on a project', r.status >= 400, status(r));
r = await A.org('GET', `/employees/${dev.id}`);
ok(
  'their record is kept for history',
  good(r) && r.payload?.status !== 'ACTIVE',
  r.payload?.status,
);
const leftRecord = r.payload;
r = await A.org('GET', `/employees/${dev.id}/detail`);
ok(
  'their leaving date is recorded',
  typeof r.payload?.dateOfLeaving === 'string' && r.payload.dateOfLeaving.length >= 10,
  String(r.payload?.dateOfLeaving),
);
r = await edit(dev.id, { firstName: 'Changed' }, leftRecord?.version);
ok('their details can no longer be edited', r.status === 409, status(r));
r = await A.org('POST', `/employees/${dev.id}/employment-records`, {
  jobTitle: 'New job',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  effectiveFrom: new Date().toISOString().slice(0, 10),
});
ok('they cannot be given a new job', r.status === 409, status(r));
r = await A.org('POST', '/payroll/profile', {
  employeeId: dev.id,
  grossSalary: 50000,
  payType: 'SALARY',
  payFrequency: 'MONTHLY',
  overtimeMultiplier: 1.5,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  payrollEnabled: true,
  salarySlipMode: 'ENABLED',
  pfEnabled: true,
  esiEnabled: false,
  ptEnabled: true,
});
ok('they cannot be given a new salary', r.status === 409, status(r));
r = await A.org('POST', `/teams/${team.id}/members`, {
  employeeId: dev.id,
  joinedAt: '2026-09-01',
});
ok('they cannot be added to a team', r.status === 409, status(r));

console.log('\nSigning out and back in keeps everything');
{
  const session = jar();
  let csrf = await signIn(session, chitra.email, chitra.password);
  const out = await call(session, 'POST', '/v1/auth/logout', null, csrf);
  ok('an employee signs out', good(out), status(out));
  r = await call(session, 'GET', `/v1/organizations/${A.orgId}/employees/${chitra.id}`);
  ok('after signing out their data is not reachable', r.status === 401, status(r));
  csrf = await signIn(session, chitra.email, chitra.password);
  r = await call(session, 'GET', `/v1/organizations/${A.orgId}/employees/${chitra.id}`);
  ok(
    'after signing back in they see their own record',
    good(r) && r.payload?.id === chitra.id,
    status(r),
  );
  r = await A.org('GET', `/employees/${bala.id}`);
  ok(
    'an earlier edit is still there on a fresh read',
    r.payload?.firstName === 'Balaji',
    r.payload?.firstName,
  );
  r = await A.org('GET', `/employees/${bala.id}/detail`);
  ok(
    'the manager set earlier is still there',
    JSON.stringify(r.payload ?? {}).includes(asha.id),
    status(r),
  );
}

console.log('\nCompany lists (project roles, job titles)');
{
  const names = async (who, kind) =>
    rows((await who('GET', `/picklists/${kind}`)).payload).map((entry) => entry.name);
  const standard = await names(A.org, 'project-roles');
  ok(
    'standard project roles are offered',
    standard.includes('Project Manager'),
    standard.length + ' roles',
  );
  r = await A.org('POST', '/picklists/project-roles', { name: '  Solution   Architect ' });
  ok(
    'an admin adds a role, tidied',
    good(r) && r.payload?.name === 'Solution Architect',
    status(r),
  );
  ok(
    'it is saved and offered to everyone',
    (await names(asha.as, 'project-roles')).includes('Solution Architect'),
  );
  r = await A.org('POST', '/picklists/project-roles', { name: 'solution architect' });
  const count = (await names(A.org, 'project-roles')).filter((n) =>
    /solution architect/i.test(n),
  ).length;
  ok(
    'the same role in other capitals is not added twice',
    good(r) && count === 1,
    `${count} entries`,
  );
  r = await asha.as('POST', '/picklists/project-roles', { name: 'Chief Everything' });
  ok('an employee cannot add to the list', refused(r), status(r));
  // Standard roles are the company's to prune: an unused one leaves the list and can come back.
  r = await A.org('POST', '/picklists/project-roles/remove', { name: 'Project Manager' });
  ok(
    'an unused standard role can be removed',
    good(r) && !(await names(A.org, 'project-roles')).includes('Project Manager'),
    status(r),
  );
  r = await A.org('POST', '/picklists/project-roles', { name: 'Project Manager' });
  ok(
    'a removed standard role can be added back',
    good(r) && (await names(A.org, 'project-roles')).includes('Project Manager'),
    status(r),
  );
  ok(
    'another company does not see this company’s role',
    !(await names(B.org, 'project-roles')).includes('Solution Architect'),
  );
  r = await A.org('POST', '/picklists/project-roles/remove', { name: 'Solution Architect' });
  ok(
    'a company role can be removed',
    good(r) && !(await names(A.org, 'project-roles')).includes('Solution Architect'),
    status(r),
  );
  r = await A.org('POST', '/picklists/job-titles', { name: 'Data Scientist' });
  ok(
    'a job title is added the same way',
    good(r) && (await names(A.org, 'job-titles')).includes('Data Scientist'),
    status(r),
  );
  r = await A.org('GET', '/picklists/no-such-list');
  ok('an unknown list is not found', r.status === 404, status(r));
}

finish();
