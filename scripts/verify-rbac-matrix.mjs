#!/usr/bin/env node
/**
 * Permission on, permission off — across the modules, and the ways someone might try to grant
 * themselves one.
 *
 * `verify-role-permissions` proves a role edit takes effect immediately, for one permission.
 * This walks the matrix: for each operation, the holder of the permission succeeds and the same
 * person without it is refused by the API itself, not by a hidden button. It then tries the
 * escalation paths: granting yourself a role, granting a permission you do not hold, editing a
 * protected role, and reaching across tenants.
 *
 *   pnpm verify:rbac-matrix
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
// This API answers a refused *read* with 409 and a refused *write* with 403.
const readRefused = (r) => r.status === 409 || refused(r);

const t = await tenant('rb');
const other = await tenant('ro');

console.log('a role held by one employee');
const role = await t.org('POST', '/roles', {
  code: `MATRIX_${Date.now() % 100000}`,
  name: 'Matrix Role',
  scope: 'ORGANIZATION',
  permissionKeys: ['attendance.read'],
});
ok('setup: the role exists', good(role), status(role));
const roleId = role.payload?.id;
const assigned = await t.org('POST', '/role-assignments', { userId: t.b.userId, roleId });
ok('setup: the employee holds it', good(assigned), status(assigned));

const grant = (keys) =>
  t.org('PUT', `/roles/${roleId}/permissions`, {
    permissionKeys: keys,
    reason: 'Matrix suite is testing this permission',
  });

/**
 * One row of the matrix: the same request, once with the permission and once without.
 *
 * `call` is made as the role holder. A read is expected to answer 409 when refused and a write
 * 403, which is the convention the rest of the API follows.
 */
async function matrix(label, permissionKeys, call, kind = 'read') {
  const denied = await call();
  ok(
    `${label}: refused without the permission`,
    kind === 'read' ? readRefused(denied) : refused(denied),
    status(denied),
  );
  const granted = await grant(['attendance.read', ...permissionKeys]);
  ok(`${label}: the permission is granted`, good(granted), status(granted));
  const allowed = await call();
  ok(`${label}: allowed with it`, good(allowed), status(allowed));
  await grant(['attendance.read']);
  const again = await call();
  ok(
    `${label}: refused again once it is taken away`,
    kind === 'read' ? readRefused(again) : refused(again),
    status(again),
  );
}

console.log('\nreads');
await matrix('employees.read.all', ['employees.read', 'employees.read.all'], () =>
  t.b.as('GET', `/employees/${t.a.id}`),
);
await matrix('payroll.policy.read', ['payroll.policy.read'], () =>
  t.b.as('GET', '/payroll/policy'),
);
await matrix('branches.read', ['branches.read'], () => t.b.as('GET', '/branches'));
await matrix('approval-policies.read', ['approval-policies.read'], () =>
  t.b.as('GET', '/approval-policies'),
);

console.log('\nwrites');
await matrix(
  'teams.write',
  ['teams.read', 'teams.write'],
  () => t.b.as('POST', '/teams', { name: `Matrix ${Date.now()}`, branchId: t.branchId }),
  'write',
);
await matrix(
  'projects.write',
  ['projects.read', 'projects.write'],
  () => t.b.as('POST', '/projects', { name: `Matrix ${Date.now()}`, branchId: t.branchId }),
  'write',
);
await matrix(
  'leave.types.write',
  ['leave.types.read', 'leave.types.write'],
  () =>
    t.b.as('POST', '/leave/types', {
      code: `MX${Date.now() % 100000}`,
      name: 'Matrix Leave',
      paid: true,
      accrualType: 'FIXED_ANNUAL',
      annualAllowance: 1,
      requiresAttachment: false,
    }),
  'write',
);
await matrix(
  'organizations.update (the holiday calendar)',
  ['organizations.read', 'organizations.update'],
  () =>
    t.b.as('POST', '/holidays', {
      name: `Matrix Holiday ${Date.now() % 10000}`,
      holidayDate: t.today,
      isOptional: true,
    }),
  'write',
);

console.log('\nthe base employee role reads its own, not the company’s');
// Teams, projects and shifts are readable by every employee by design — the list is scoped to
// what they belong to rather than refused outright, which is what these assert.
let base = await t.b.as('GET', '/teams');
ok('an employee may list teams', good(base), status(base));
ok(
  'and sees only teams they belong to or lead',
  rows(base.payload).every(
    (view) =>
      (view.members ?? []).some((member) => member.employeeId === t.b.id) ||
      view.teamLeadEmployeeId === t.b.id,
  ),
  `${rows(base.payload).length} teams`,
);
base = await t.b.as('GET', '/shifts');
ok('an employee may list shifts', good(base), status(base));

console.log('\nself-scope stays self-scoped');
let r = await t.b.as('GET', `/attendance?employeeId=${t.b.id}&from=${t.monthStart}&to=${t.today}`);
ok('an employee reads their own attendance with attendance.read alone', good(r), status(r));
r = await t.b.as('GET', `/attendance?employeeId=${t.a.id}&from=${t.monthStart}&to=${t.today}`);
ok("and not a colleague's", readRefused(r), status(r));

console.log('\nprivilege escalation');
r = await t.b.as('PUT', `/roles/${roleId}/permissions`, {
  permissionKeys: ['*'],
  reason: 'Granting myself everything',
});
ok('the role holder cannot edit their own role', refused(r), status(r));
r = await t.b.as('POST', '/role-assignments', { userId: t.b.userId, roleId });
ok('nor assign themselves another role', refused(r), status(r));
r = await t.b.as('POST', '/roles', {
  code: `ESC_${Date.now() % 100000}`,
  name: 'Escalation',
  scope: 'ORGANIZATION',
  permissionKeys: ['*'],
});
ok('nor create a role carrying the wildcard', refused(r), status(r));

const adminRole = rows((await t.org('GET', '/roles')).payload).find(
  (entry) => entry.code === 'ORG_ADMIN',
);
r = await t.org('PUT', `/roles/${adminRole?.id}/permissions`, {
  permissionKeys: ['attendance.read'],
  reason: 'Trying to reduce the built-in administrator',
});
ok('even an administrator cannot edit the built-in admin role', r.status === 409, status(r));
r = await t.org('PUT', `/roles/${roleId}/permissions`, {
  permissionKeys: ['attendance.read', 'nonsense.permission'],
  reason: 'Granting a permission the application does not use',
});
ok('a permission the application does not define is refused', r.status === 409, status(r));

console.log('\nacross tenants');
r = await other.org('PUT', `/roles/${roleId}/permissions`, {
  permissionKeys: ['attendance.read', 'attendance.read.all'],
  reason: 'Reaching into another tenant',
});
ok("another tenant cannot edit this tenant's role", refused(r), status(r));
r = await other.org('POST', '/role-assignments', { userId: t.b.userId, roleId });
ok('nor assign it to its own people', refused(r), status(r));

console.log('\nconcurrency: one role assigned twice at once');
const secondRole = await t.org('POST', '/roles', {
  code: `RACE_${Date.now() % 100000}`,
  name: 'Race Role',
  scope: 'ORGANIZATION',
  permissionKeys: ['attendance.read'],
});
const [a1, a2] = await Promise.all([
  t.org('POST', '/role-assignments', { userId: t.a.userId, roleId: secondRole.payload?.id }),
  t.org('POST', '/role-assignments', { userId: t.a.userId, roleId: secondRole.payload?.id }),
]);
ok(
  'two simultaneous assignments create one, and say so',
  [a1.status, a2.status].filter((s) => s === 200 || s === 201).length === 1,
  `${a1.status} and ${a2.status}`,
);
const held = rows((await t.org('GET', '/members')).payload).find(
  (member) => member.userId === t.a.userId,
);
ok(
  'the member holds it exactly once',
  (held?.roles ?? []).filter((entry) => entry.id === secondRole.payload?.id).length === 1,
  JSON.stringify((held?.roles ?? []).map((entry) => entry.code)),
);

finish();
