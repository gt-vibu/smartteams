#!/usr/bin/env node
/**
 * Master data and relationships, end to end: the organization's lists (project roles, job titles,
 * team roles, departments) and who is on which team and project, managed from either side.
 * Duplicates in any spelling or from two admins at once, archiving without losing history,
 * former employees and other companies kept out, and both directions of a relationship agreeing.
 *
 *   pnpm verify:master-data
 */
import { testAadhaar } from './lib/aadhaar.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (r.payload?.detail ? ' ' + r.payload.detail : '');
const t = await tenant('md');
const other = await tenant('mx');
const today = t.today;

// Ten people: the harness's two with logins, and eight more.
const staff = [t.a, t.b];
for (const name of ['Chitra', 'Dev', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jay']) {
  const r = await t.org('POST', '/employees', {
    firstName: name,
    lastName: 'Rao',
    employmentType: 'FULL_TIME',
    workEmail: `${name.toLowerCase()}.${Date.now().toString(36)}@md.test`,
    aadhaarNumber: testAadhaar(),
    dateOfJoining: '2026-01-05',
  });
  staff.push({ id: r.payload?.id });
}
ok('a company of ten', staff.filter((s) => s.id).length === 10, String(staff.length));
const [ada, bea, chitra, dev, esha] = staff;
const list = async (who, kind) => rows((await who(`GET`, `/picklists/${kind}`)).payload);
const names = async (who, kind, archived = false) =>
  (await list(who, kind)).filter((e) => e.archived === archived).map((e) => e.name);

console.log('\nThe lists');
let entries = await list(t.org, 'project-roles');
ok(
  'project roles start from a standard set',
  entries.some((e) => e.name === 'Project Manager'),
);
const plain = entries.map((e) => e.name);
ok(
  'and are in alphabetical order',
  plain.join() === [...plain].sort((a, b) => a.localeCompare(b)).join(),
);
let r = await t.org('POST', '/picklists/project-roles', { name: '  backend   DEVELOPER ' });
ok(
  'a standard name typed again in another case is not duplicated',
  r.payload?.name === 'Backend Developer',
  status(r),
);
const racing = await Promise.all([
  t.org('POST', '/picklists/project-roles', { name: 'Data Engineer' }),
  t.org('POST', '/picklists/project-roles', { name: 'data engineer' }),
]);
ok(
  'two admins adding the same role at once make one',
  racing.every(good) &&
    (await names(t.org, 'project-roles')).filter((n) => /data engineer/i.test(n)).length === 1,
  racing.map((x) => x.status).join(),
);
const titles = await Promise.all([
  t.org('POST', '/picklists/job-titles', { name: 'Chief of Staff' }),
  t.org('POST', '/picklists/job-titles', { name: 'chief of staff' }),
]);
ok(
  'two admins adding the same job title at once make one',
  titles.every(good) &&
    (await names(t.org, 'job-titles')).filter((n) => /chief of staff/i.test(n)).length === 1,
);
const depts = await Promise.all([
  t.org('POST', '/departments', { name: 'Sales' }),
  t.org('POST', '/departments', { name: ' sales ' }),
]);
ok(
  'two admins creating the same department at once make one',
  depts.filter(good).length === 1,
  depts.map((x) => x.status).join(),
);
r = await ada.as('POST', '/picklists/project-roles', { name: 'Chief Everything' });
ok('an employee cannot add to a list', refused(r), status(r));
r = await ada.as('POST', '/picklists/project-roles/archive', { name: 'Consultant' });
ok('an employee cannot archive an entry', refused(r), status(r));
ok(
  'another company does not see this company’s entries',
  !(await names(other.org, 'project-roles')).includes('Data Engineer'),
);

console.log('\nProjects, managed from the project');
const apollo = (await t.org('POST', '/projects', { name: 'Apollo', branchId: t.branchId })).payload;
const hermes = (await t.org('POST', '/projects', { name: 'Hermes', branchId: t.branchId })).payload;
const allocate = (projectId, employeeId, projectRole, startsOn = '2026-02-01') =>
  t.org('POST', `/projects/${projectId}/members`, { employeeId, projectRole, startsOn });
r = await allocate(apollo.id, ada.id, 'Mobile Developer');
ok(
  'allocating with a role typed but never added saves it',
  good(r) && r.payload?.projectRole === 'Mobile Developer',
  status(r),
);
ok(
  'and the role is now in the list for everyone',
  (await names(ada.as, 'project-roles')).includes('Mobile Developer'),
);
r = await allocate(apollo.id, bea.id, '  mobile developer ');
ok(
  'the same role in another spelling uses the list’s spelling',
  r.payload?.projectRole === 'Mobile Developer',
  status(r),
);
const beaOnApollo = r.payload;
const twice = await Promise.all([
  allocate(hermes.id, chitra.id, 'QA Engineer'),
  allocate(hermes.id, chitra.id, 'QA Engineer'),
]);
ok(
  'two admins adding the same person at once add them once',
  twice.filter(good).length === 1,
  twice.map((x) => x.status).join(),
);
r = await t.org('PATCH', `/projects/${apollo.id}/members/${beaOnApollo?.id}`, {
  projectRole: 'Team Lead',
});
ok('a member’s role can be changed', good(r) && r.payload?.projectRole === 'Team Lead', status(r));
entries = await list(t.org, 'project-roles');
const mobile = entries.find((e) => e.name === 'Mobile Developer');
ok(
  'usage is counted',
  mobile?.usage?.total === 1 && mobile?.usage?.active === 1,
  JSON.stringify(mobile?.usage),
);
r = await t.org('POST', '/picklists/project-roles/remove', { name: 'Mobile Developer' });
ok('a role in use cannot be deleted', r.status === 409, status(r));
r = await t.org('POST', '/picklists/project-roles/rename', {
  name: 'Mobile Developer',
  to: 'App Developer',
});
const renamedOn = rows((await t.org('GET', '/projects')).payload)
  .find((p) => p.id === apollo.id)
  ?.members?.find((m) => m.employeeId === ada.id)?.projectRole;
ok(
  'renaming a role in use renames it on the assignments that carry it',
  good(r) && renamedOn === 'App Developer',
  status(r) + ' ' + renamedOn,
);
r = await t.org('POST', '/picklists/project-roles/rename', {
  name: 'App Developer',
  to: 'Mobile Developer',
});
ok('and it can be renamed back', good(r), status(r));
r = await t.org('POST', '/picklists/project-roles/archive', { name: 'Mobile Developer' });
ok('it can be archived', good(r) && r.payload?.archived === true, status(r));
r = await allocate(hermes.id, dev.id, 'Mobile Developer');
ok('an archived role is refused for a new assignment', r.status === 409, status(r));
const apolloNow = rows((await t.org('GET', '/projects')).payload).find((p) => p.id === apollo.id);
ok(
  'the existing assignment still shows the archived role',
  apolloNow?.members?.some((m) => m.employeeId === ada.id && m.projectRole === 'Mobile Developer'),
);
r = await t.org('POST', '/picklists/project-roles/restore', { name: 'Mobile Developer' });
ok('it can be restored', good(r) && r.payload?.archived === false, status(r));
await t.org('POST', '/picklists/project-roles', { name: 'Spare Role' });
r = await t.org('POST', '/picklists/project-roles/rename', {
  name: 'Spare Role',
  to: 'Solution Architect',
});
ok('an unused role can be renamed', good(r) && r.payload?.name === 'Solution Architect', status(r));
r = await t.org('POST', '/picklists/project-roles/remove', { name: 'Solution Architect' });
ok(
  'an unused role can be deleted',
  good(r) && !(await names(t.org, 'project-roles')).includes('Solution Architect'),
  status(r),
);
r = await t.org('POST', '/picklists/project-roles/rename', { name: 'Consultant', to: 'Advisor' });
let roleNames = await names(t.org, 'project-roles');
ok(
  'a standard role can be renamed',
  good(r) && roleNames.includes('Advisor') && !roleNames.includes('Consultant'),
  status(r),
);
r = await t.org('POST', '/picklists/project-roles/remove', { name: 'Business Analyst' });
roleNames = await names(t.org, 'project-roles');
ok(
  'an unused standard role can be deleted',
  good(r) && !roleNames.includes('Business Analyst'),
  status(r),
);
r = await t.org('POST', '/picklists/project-roles', { name: 'Business Analyst' });
ok(
  'and adding it again brings it back',
  good(r) && (await names(t.org, 'project-roles')).includes('Business Analyst'),
  status(r),
);

console.log('\nThe same assignment seen from both sides');
const adaProjects = rows((await ada.as('GET', '/projects')).payload);
ok(
  'the employee sees the project they were added to',
  adaProjects.some((p) => p.id === apollo.id),
);
ok('and not the one they were not', !adaProjects.some((p) => p.id === hermes.id));
const adaRow = adaProjects
  .find((p) => p.id === apollo.id)
  ?.members?.find((m) => m.employeeId === ada.id);
ok(
  'both sides show the same role',
  adaRow?.projectRole === 'Mobile Developer',
  adaRow?.projectRole,
);
r = await t.org('POST', `/projects/${apollo.id}/members/${beaOnApollo?.id}/end`, {
  endsOn: '2026-06-30',
});
ok('a member is removed by ending the assignment', good(r), status(r));
r = await allocate(apollo.id, bea.id, 'Team Lead', '2026-07-01');
ok('they can be added back after it ended', good(r), status(r));
const beaRows =
  rows((await t.org('GET', '/projects')).payload)
    .find((p) => p.id === apollo.id)
    ?.members?.filter((m) => m.employeeId === bea.id) ?? [];
ok(
  'the earlier assignment is kept as history',
  beaRows.length === 2 && beaRows.some((m) => m.endsOn === '2026-06-30'),
  String(beaRows.length),
);

console.log('\nTeams');
const core = (await t.org('POST', '/teams', { name: 'Core', branchId: t.branchId })).payload;
const join = (employeeId, teamRole) =>
  t.org('POST', `/teams/${core.id}/members`, { employeeId, teamRole, joinedAt: '2026-02-01' });
r = await join(ada.id, 'lead');
ok(
  'a member joins with a team role from the list',
  good(r) && r.payload?.teamRole === 'Lead',
  status(r),
);
const adaInCore = r.payload;
r = await join(bea.id, 'Pair Programmer');
ok(
  'a new team role typed while adding is saved to the list',
  good(r) && (await names(t.org, 'team-roles')).includes('Pair Programmer'),
  status(r),
);
const both = await Promise.all([join(esha.id, 'Member'), join(esha.id, 'Member')]);
ok(
  'two admins adding the same person at once add them once',
  both.filter(good).length === 1,
  both.map((x) => x.status).join(),
);
r = await t.org('PATCH', `/teams/${core.id}/members/${adaInCore?.id}`, { teamRole: 'Reviewer' });
ok('a member’s team role can be changed', good(r) && r.payload?.teamRole === 'Reviewer', status(r));
const coreView = rows((await ada.as('GET', '/teams')).payload).find((x) => x.id === core.id);
ok(
  'the employee’s view of the team shows the same role',
  coreView?.members?.some((m) => m.employeeId === ada.id && m.teamRole === 'Reviewer'),
);

console.log('\nJob titles through the employee record');
r = await t.org('POST', `/employees/${dev.id}/employment-records`, {
  jobTitle: '  staff   engineer ',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  effectiveFrom: today,
});
ok(
  'a new job title typed on the record is saved to the list',
  good(r) && (await names(t.org, 'job-titles')).includes('staff engineer'),
  status(r),
);
await t.org('POST', '/picklists/job-titles/archive', { name: 'Intern' });
r = await t.org('POST', `/employees/${esha.id}/employment-records`, {
  jobTitle: 'Intern',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  effectiveFrom: today,
});
ok('an archived job title is refused for a new record', r.status === 409, status(r));

console.log('\nLeaving the company');
r = await t.org('POST', `/employees/${chitra.id}/deactivate`, { reason: 'master data audit' });
ok('an employee leaves', good(r), status(r));
const hermesNow = rows((await t.org('GET', '/projects')).payload).find((p) => p.id === hermes.id);
const chitraRow = hermesNow?.members?.find((m) => m.employeeId === chitra.id);
ok(
  'their project assignment ended on their last day, and is kept',
  chitraRow && chitraRow.endsOn !== null,
  JSON.stringify(chitraRow),
);
r = await allocate(apollo.id, chitra.id, 'QA Engineer', today);
ok('they cannot be put on a project', r.status === 409, status(r));
r = await join(chitra.id, 'Member');
ok('they cannot be put on a team', r.status === 409, status(r));
r = await t.org('GET', `/employees/${chitra.id}`);
ok(
  'their employee record still exists',
  good(r) && r.payload?.status !== 'ACTIVE',
  r.payload?.status,
);

console.log('\nOther companies');
const outsider = rows((await other.org('GET', '/employees')).payload)[0];
r = await allocate(apollo.id, outsider?.id, 'QA Engineer');
ok('an employee of another company cannot be allocated', r.status >= 400, status(r));
r = await other.org('POST', `/projects/${apollo.id}/members`, {
  employeeId: outsider?.id,
  startsOn: today,
});
ok('another company cannot add to this company’s project', r.status >= 400, status(r));
r = await other.org('PATCH', `/teams/${core.id}/members/${adaInCore?.id}`, { teamRole: 'Lead' });
ok('another company cannot change this company’s team roles', r.status >= 400, status(r));

console.log('\nOn a fresh read');
r = await ada.as('GET', '/projects');
ok(
  'the same assignment and role are there on a fresh read by the employee',
  rows(r.payload)
    .find((p) => p.id === apollo.id)
    ?.members?.some((m) => m.employeeId === ada.id && m.projectRole === 'Mobile Developer'),
);

console.log('\nBranches');
r = await t.org('POST', '/branches', {
  name: 'Pune Office',
  code: 'pune',
  timezone: 'Asia/Kolkata',
});
ok(
  'a branch is created with its timezone',
  good(r) && r.payload?.timezone === 'Asia/Kolkata',
  status(r),
);
const pune = r.payload;
r = await t.org('PATCH', `/branches/${pune?.id}`, { timezone: 'Mars/Olympus' });
ok('an unknown timezone is refused', r.status === 409, status(r));
r = await t.org('PATCH', `/branches/${pune?.id}`, {
  address: {
    line1: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
    country: 'India',
  },
});
ok('the address is saved', good(r) && r.payload?.address?.city === 'Pune', status(r));
r = await t.org('POST', '/attendance/preferences', {
  branchId: pune?.id,
  geofenceMode: 'FLAG_ONLY',
  workLocations: [
    { name: 'Main office', latitude: 18.5204, longitude: 73.8567, radiusMeters: 150 },
  ],
});
ok('the branch’s attendance rules and work locations are saved', good(r), status(r));
r = await t.org('GET', `/branches/${pune?.id}/overview`);
ok(
  'the branch overview shows its work locations and rules',
  good(r) &&
    r.payload?.geofenceMode === 'FLAG_ONLY' &&
    r.payload?.workLocations?.length === 1 &&
    r.payload.workLocations[0].radiusMeters === 150,
  status(r),
);
await t.org('POST', `/employees/${esha.id}/branches`, {
  branchId: pune?.id,
  startsOn: today,
  isPrimary: true,
});
r = await t.org('GET', `/branches/${pune?.id}/overview`);
ok(
  'the headcount counts current employees based there',
  r.payload?.employeeCount === 1,
  String(r.payload?.employeeCount),
);
r = await ada.as('PATCH', `/branches/${pune?.id}`, { name: 'Taken over' });
ok('an employee cannot change a branch', refused(r), status(r));
r = await other.org('GET', `/branches/${pune?.id}/overview`);
ok('another company cannot see the branch', r.status >= 400, status(r));

console.log('\nWhat an employee sees');
const adaTeams = rows((await ada.as('GET', '/teams')).payload);
ok(
  'an employee sees the team they are on',
  adaTeams.some((x) => x.id === core.id),
  adaTeams.length + ' teams',
);
const otherTeam = (await t.org('POST', '/teams', { name: 'Finance', branchId: t.branchId }))
  .payload;
ok(
  'and not a team they are not on',
  !rows((await ada.as('GET', '/teams')).payload).some((x) => x.id === otherTeam.id),
);
ok(
  'the administrator still sees every team',
  rows((await t.org('GET', '/teams')).payload).some((x) => x.id === otherTeam.id),
);
const beaOnTeam = adaTeams
  .find((x) => x.id === core.id)
  ?.members?.find((m) => m.employeeId === bea.id);
ok(
  'a member list names colleagues, though an employee cannot read the directory',
  beaOnTeam?.employee?.firstName === 'Bea',
  JSON.stringify(beaOnTeam?.employee),
);
const adaProjectMembers = rows((await ada.as('GET', '/projects')).payload).find(
  (p) => p.id === apollo.id,
)?.members;
ok(
  'and so does a project member list',
  adaProjectMembers?.some((m) => m.employee?.firstName === 'Bea'),
);
r = await ada.as('GET', '/employees');
ok(
  'but the directory itself is still only themselves',
  rows(r.payload).length <= 1,
  rows(r.payload).length + ' employees',
);

finish();
