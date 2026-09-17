#!/usr/bin/env node
/**
 * Turning a role's permissions on and off — against the running API.
 *
 * An existing role's permissions could not be changed; an organization had to create a new role
 * and move everyone onto it. This checks that a change is real, immediate and bounded:
 *
 *   a permission turned on for a role lets its holder do the thing on their very next request →
 *   turned off, it stops them again → the Organization Admin role cannot be edited → nor can a
 *   permission the application does not use be granted → an employee cannot edit roles → another
 *   tenant cannot reach the role → the change is audited with its reason.
 *
 *   pnpm verify:role-permissions
 */
import { createRequire } from 'node:module';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));

const t = await tenant('rp');
const other = await tenant('rx');

console.log('a role, and someone who holds it');
const created = await t.org('POST', '/roles', {
  code: 'TEAM_LEAD',
  name: 'Team Lead',
  scope: 'ORGANIZATION',
  permissionKeys: ['attendance.read'],
});
ok('setup: a Team Lead role that sees only its own attendance', good(created), status(created));
const roleId = created.payload?.id;
const assigned = await t.org('POST', '/role-assignments', { userId: t.b.userId, roleId });
ok('setup: Bea is a Team Lead', good(assigned), status(assigned));

// A read refused for scope answers 409 in this API ("reads refuse with 409, writes with 403").
const readRefused = (r) => r.status === 409 || refused(r);
const readAda = () =>
  t.b.as('GET', `/attendance?employeeId=${t.a.id}&from=${t.monthStart}&to=${t.today}`);
const before = await readAda();
ok("before: Bea cannot read Ada's attendance", readRefused(before), status(before));

console.log('\nturning a permission on');
const path = `/roles/${roleId}/permissions`;
const on = await t.org('PUT', path, {
  permissionKeys: ['attendance.read', 'attendance.read.all'],
  reason: 'Team leads see their whole team',
});
ok('the administrator turns on "View everyone’s attendance"', good(on), status(on));
ok(
  'the role now carries it',
  rows(on.payload?.permissions ?? []).some(
    (entry) => entry.permission?.key === 'attendance.read.all',
  ),
);
const after = await readAda();
ok("Bea can read Ada's attendance on her very next request", good(after), status(after));

console.log('\nturning it off again');
const off = await t.org('PUT', path, {
  permissionKeys: ['attendance.read'],
  reason: 'Back to own records only',
});
ok('the administrator turns it off', good(off), status(off));
const again = await readAda();
ok('and Bea is refused again straight away', readRefused(again), status(again));

console.log('\nwhat is refused');
const adminRole = rows((await t.org('GET', '/roles')).payload).find(
  (role) => role.code === 'ORG_ADMIN',
);
const editAdmin = await t.org('PUT', `/roles/${adminRole?.id}/permissions`, {
  permissionKeys: ['attendance.read'],
  reason: 'Trying to narrow the administrator',
});
ok('the Organization Admin role cannot be edited', editAdmin.status === 409, status(editAdmin));
const unknownKey = await t.org('PUT', path, {
  permissionKeys: ['attendance.read', 'timesheets.approve'],
  reason: 'A permission that does not exist',
});
ok(
  'a permission the application does not use is refused',
  unknownKey.status === 409,
  status(unknownKey),
);
const wildcard = await t.org('PUT', path, { permissionKeys: ['*'], reason: 'Everything' });
ok('so is the wildcard', wildcard.status === 409, status(wildcard));
const noReason = await t.org('PUT', path, { permissionKeys: ['attendance.read'], reason: '' });
ok('a change needs a reason', noReason.status === 400, status(noReason));
const byEmployee = await t.a.as('PUT', path, {
  permissionKeys: ['attendance.read', 'attendance.read.all'],
  reason: 'Giving myself more',
});
ok('an employee cannot edit a role', byEmployee.status === 403, status(byEmployee));
const byOtherTenant = await other.org('PUT', path, {
  permissionKeys: ['attendance.read'],
  reason: 'Another organization',
});
ok('another tenant cannot reach the role', byOtherTenant.status === 404, status(byOtherTenant));

const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
const audit = await db.query(
  "SELECT reason FROM audit_logs WHERE entity_id = $1 AND action = 'ROLE_PERMISSIONS_UPDATED' ORDER BY created_at",
  [roleId],
);
ok(
  'both changes are audited with their reasons',
  audit.rows.map((row) => row.reason).join(' | ') ===
    'Team leads see their whole team | Back to own records only',
  audit.rows.map((row) => row.reason).join(' | '),
);
await db.end();

finish();
