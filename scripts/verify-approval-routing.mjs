#!/usr/bin/env node
/**
 * Approval routing an administrator builds themselves — against the running API.
 *
 *   who can be named on a step → a reporting-manager step refuses a request when there is no
 *   manager and no backup → with a backup role the administrator decides instead → once the
 *   requester has a manager, only that manager decides → editing a policy that has already
 *   routed requests starts a new version, and a request already waiting finishes on the steps it
 *   started with → a step naming one person is decided by that person alone.
 *
 *   pnpm verify:approval-routing
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('ar');
const adminRole = t.roles.find((role) => role.code === 'ORG_ADMIN');
const types = rows((await t.org('GET', '/leave/types')).payload);
const leaveType = types.find((type) => type.paid && Number(type.annualAllowance ?? 0) >= 5);
ok('setup: a paid leave type with an allowance', Boolean(leaveType), leaveType?.code);

// Weekdays well ahead, one per request, so no two overlap.
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
let next = 0;
const apply = (who) => {
  const day = days[next++];
  return who.as('POST', '/leave/requests', {
    employeeId: who.id,
    leaveTypeId: leaveType?.id,
    startDate: day,
    endDate: day,
    reason: 'Routing check',
  });
};
const decide = (as, id) =>
  as('POST', `/leave/requests/${id}/decision`, { status: 'APPROVED', comment: 'Routing check' });
const admin = (method, path, body) => t.org(method, path, body);

console.log('who can be named on a step');
let r = await admin('GET', '/approval-policies/approver-candidates');
const candidates = Array.isArray(r.payload) ? r.payload : [];
ok(
  'the administrator sees everyone with a login',
  good(r) && [t.a.userId, t.b.userId].every((id) => candidates.some((c) => c.userId === id)),
  status(r),
);
r = await t.a.as('GET', '/approval-policies/approver-candidates');
ok('an employee cannot list them', refused(r), status(r));

console.log('\na reporting-manager step with no backup');
r = await admin('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: 'LEAVE_MGR',
  name: 'Leave via manager',
  isDefault: true,
  steps: [{ stepNumber: 1, approverType: 'MANAGER' }],
});
ok('the policy is created and made the default', good(r) && r.payload?.isDefault, status(r));
const policyId = r.payload?.id;
r = await apply(t.a);
ok(
  'Ada has no manager, so her request is refused and says why',
  r.status === 409 && /reporting manager/.test(r.payload?.detail ?? ''),
  status(r),
);
next -= 1;

console.log('\nthe same step with the administrator as backup');
r = await admin('PATCH', `/approval-policies/${policyId}`, {
  steps: [{ stepNumber: 1, approverType: 'MANAGER', roleId: adminRole?.id }],
});
ok('a policy with no history is edited in place', good(r) && r.payload?.id === policyId, status(r));
r = await apply(t.a);
ok('Ada can now ask', good(r), status(r));
const first = r.payload?.id;
r = await decide(t.b.as, first);
ok('a colleague cannot decide it', refused(r), status(r));
r = await decide(admin, first);
ok('the administrator decides it in the manager’s place', good(r), status(r));

console.log('\nonce Ada has a manager');
r = await admin('PUT', `/employees/${t.a.id}/manager`, { managerEmployeeId: t.b.id });
ok('setup: Bea becomes Ada’s manager', good(r), status(r));
r = await apply(t.a);
ok('Ada asks again', good(r), status(r));
const waiting = r.payload?.id;
r = await decide(admin, waiting);
ok('the backup no longer decides: her manager is there', refused(r), status(r));

console.log('\nediting a policy that has already routed requests');
r = await admin('PATCH', `/approval-policies/${policyId}`, {
  steps: [{ stepNumber: 1, approverType: 'USER', approverUserId: t.b.userId }],
});
const versionId = r.payload?.id;
ok(
  'the edit is accepted as a new version',
  good(r) && versionId && versionId !== policyId,
  status(r),
);
const policies = rows((await admin('GET', '/approval-policies')).payload);
const old = policies.find((policy) => policy.id === policyId);
const current = policies.find((policy) => policy.id === versionId);
ok('the old version is retired', old && !old.isActive && !old.isDefault, old?.code);
ok(
  'the new one keeps the name and code, and is the default',
  current?.code === 'LEAVE_MGR' && current?.isDefault,
);
r = await decide(t.b.as, waiting);
ok('the request already waiting is decided on its original steps', good(r), status(r));

console.log('\na step naming one person');
r = await apply(t.a);
ok('Ada asks under the new version', good(r), status(r));
const named = r.payload?.id;
r = await decide(admin, named);
ok('the administrator is not that person', refused(r), status(r));
r = await decide(t.b.as, named);
ok('the named person decides it', good(r), status(r));

finish();
