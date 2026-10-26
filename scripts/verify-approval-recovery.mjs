import { call, finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';
import { testAadhaar } from './lib/aadhaar.mjs';
const t = await tenant('approval-recovery', { defaultPolicies: false });
const me = await call(t.cookies, 'GET', '/v1/auth/me');
const adminUserId = me.payload.user.id;
const adminRole = t.roles.find((role) => role.code === 'ORG_ADMIN');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (type) => type.paid && !type.requiresAttachment && Number(type.annualAllowance) >= 5,
);
const adminEmployee = await t.org('POST', '/employees', {
  employeeNumber: 'HR-001',
  firstName: 'HR',
  lastName: 'Reviewer',
  workEmail: me.payload.user.email,
  aadhaarNumber: testAadhaar(),
  employmentType: 'FULL_TIME',
  dateOfJoining: '2026-01-01',
});
if (!good(adminEmployee))
  throw new Error('Cannot create review employee: ' + adminEmployee.payload?.detail);
await t.org('POST', `/employees/${adminEmployee.payload.id}/user`, { userId: adminUserId });
await t.org('POST', `/employees/${adminEmployee.payload.id}/branches`, {
  branchId: t.branchId,
  startsOn: '2026-01-01',
  isPrimary: true,
});
const policy = await t.org('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: 'RECOVERY',
  name: 'Three stage review',
  isDefault: true,
  steps: [
    { stepNumber: 1, approverType: 'ROLE', roleId: adminRole.id },
    { stepNumber: 2, approverType: 'USER', approverUserId: t.b.userId },
    { stepNumber: 3, approverType: 'ROLE', roleId: adminRole.id },
  ],
});
ok('one role can be used at more than one stage', good(policy), policy.payload?.detail);
const leave = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: type.id,
  startDate: '2026-11-23',
  endDate: '2026-11-23',
  reason: 'Routing recovery verification',
});
if (!good(leave)) throw new Error('Cannot create request: ' + leave.payload?.detail);
const decide = () =>
  t.org('POST', `/leave/requests/${leave.payload.id}/decision`, { status: 'APPROVED' });
const first = await decide();
ok(
  'first stage completes while later stages remain pending',
  good(first) && first.payload.status === 'PENDING',
);
const deactivated = await t.org('POST', `/employees/${t.b.id}/deactivate`, {
  reason: 'Approver has left the organization',
});
ok('approver deactivation succeeds', good(deactivated), deactivated.payload?.detail);
const exceptions = await t.org('GET', '/approval-operations/exceptions?domain=LEAVE');
ok(
  'HR sees a request whose next approver is unavailable',
  good(exceptions) &&
    exceptions.payload.items.some((item) => item.id === leave.payload.id && item.stepNumber === 2),
  exceptions.payload?.detail,
);
const denied = await t.a.as('GET', '/approval-operations/exceptions?domain=LEAVE');
ok('employee cannot inspect HR routing exceptions', refused(denied));
const assignment = {
  domain: 'LEAVE',
  requestId: leave.payload.id,
  approverUserId: adminUserId,
  expectedStepNumber: 2,
  reason: 'Original approver unavailable; HR covering this stage',
};
const stale = await t.org('POST', '/approval-operations/reassign', {
  ...assignment,
  expectedStepNumber: 1,
});
ok('reassignment refuses a stale approval stage', stale.status === 409);
const fixed = await t.org('POST', '/approval-operations/reassign', assignment);
ok(
  'HR reassigns only the current stage with an audit reason',
  good(fixed) && fixed.payload.stepNumber === 2,
  fixed.payload?.detail,
);
const after = await t.org('GET', '/approval-operations/exceptions?domain=LEAVE');
ok(
  'repaired request disappears from routing exceptions',
  good(after) && !after.payload.items.some((item) => item.id === leave.payload.id),
);
const policies = rows((await t.org('GET', '/approval-policies')).payload);
ok(
  'shared policy remains unchanged and private routing is hidden',
  policies.some(
    (item) => item.id === policy.payload.id && item.steps[1].approverUserId === t.b.userId,
  ) && !policies.some((item) => item.code.startsWith('SYS_REQ_')),
);
const second = await decide();
ok(
  'replacement stage succeeds without skipping the final stage',
  good(second) && second.payload.status === 'PENDING',
  second.payload?.detail,
);
const third = await decide();
ok(
  'remaining final stage completes the real leave workflow',
  good(third) && third.payload.status === 'APPROVED',
  third.payload?.detail,
);
finish();
