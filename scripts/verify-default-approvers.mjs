#!/usr/bin/env node
/**
 * An organization that never set up approvals — against the running API.
 *
 * Organizations were created with a leave approval policy and nothing else, so an employee's
 * timesheet or attendance correction was refused until an administrator built a policy, and the
 * product never said so. Now the administrator role approves by default. This drives a brand-new
 * organization whose owner has configured nothing:
 *
 *   the defaults are there and editable → an employee's timesheet submits and reaches the
 *   administrator → the employee cannot approve it → the administrator can → an attendance
 *   correction routes the same way → the organization chooses a different approver, and new
 *   requests follow its choice.
 *
 *   pnpm verify:default-approvers
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));

// No policies from the harness: this is an organization exactly as it is created.
const t = await tenant('da', { defaultPolicies: false });

console.log('what a new organization starts with');
const policies = rows((await t.org('GET', '/approval-policies')).payload);
const roles = rows((await t.org('GET', '/roles')).payload);
const adminRole = roles.find((role) => role.code === 'ORG_ADMIN');
const defaultFor = (domain) =>
  policies.find((policy) => policy.domain === domain && policy.isDefault && policy.isActive);
for (const domain of ['LEAVE', 'TIMESHEET', 'ATTENDANCE_CORRECTION']) {
  const policy = defaultFor(domain);
  const step = policy?.steps?.[0];
  ok(
    `${domain}: a default policy approved by the administrator role`,
    step?.approverType === 'ROLE' && step?.roleId === adminRole?.id,
    policy
      ? `${policy.code} → ${step?.approverType} ${step?.roleId === adminRole?.id ? 'ORG_ADMIN' : step?.roleId}`
      : 'none',
  );
}

console.log('\na timesheet, with nothing configured');
const period = { periodType: 'MONTHLY', periodStart: t.monthStart, periodEnd: t.today };
const opened = await t.org('POST', '/timesheets/periods', period);
ok('setup: the administrator opens the period', good(opened), status(opened));
await t.org('POST', '/timesheets/periods/' + opened.payload?.id + '/derive', {});
const logged = await t.a.as('POST', '/timesheets/entries', {
  workDate: t.today,
  minutes: 240,
  description: 'Client onboarding',
});
ok('setup: Ada logs her hours', good(logged), status(logged));
const sheetId = logged.payload?.timesheet?.id;
const submitted = await t.a.as('POST', '/timesheets/' + sheetId + '/submit', {});
ok(
  'Ada submits her timesheet — no longer refused for want of a policy',
  good(submitted),
  status(submitted),
);
const ownDecision = await t.a.as('POST', '/timesheets/' + sheetId + '/decision', {
  status: 'APPROVED',
  comment: 'Approving my own hours',
});
ok('Ada cannot approve it', refused(ownDecision), status(ownDecision));
const colleague = await t.b.as('POST', '/timesheets/' + sheetId + '/decision', {
  status: 'APPROVED',
  comment: 'Approving a colleague',
});
ok('nor can a colleague', refused(colleague), status(colleague));
const approved = await t.org('POST', '/timesheets/' + sheetId + '/decision', {
  status: 'APPROVED',
  comment: 'Hours confirmed',
});
ok('the administrator approves it', good(approved), status(approved));

console.log('\nan attendance correction, with nothing configured');
const checkInAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const checkIn = await t.org('POST', '/attendance/check-ins', {
  employeeId: t.b.id,
  occurredAt: checkInAt,
  workDate: t.today,
  branchId: t.branchId,
});
ok('setup: Bea checks in and never out', good(checkIn), status(checkIn));
const day = rows(
  (await t.org('GET', `/attendance?employeeId=${t.b.id}&from=${t.today}&to=${t.today}`)).payload,
)[0];
const asked = await t.b.as('POST', `/attendance/${day?.id}/corrections/missing-check-out`, {
  checkOutAt: new Date(new Date(checkInAt).getTime() + 60 * 60 * 1000).toISOString(),
  reason: 'Forgot to check out',
});
ok('Bea asks for her check-out — routed, not refused', good(asked), status(asked));
const inbox = rows((await t.org('GET', '/attendance/corrections/inbox')).payload);
ok(
  "it is in the administrator's inbox",
  inbox.some((entry) => entry.id === asked.payload?.id),
  `${inbox.length} item(s)`,
);

console.log('\nthe organization chooses someone else');
const managerRole = roles.find((role) => role.code === 'HR_ADMIN');
const replaced = await t.org('POST', '/approval-policies', {
  domain: 'TIMESHEET',
  code: 'TS_HR',
  name: 'Timesheets go to HR',
  isDefault: true,
  steps: [{ stepNumber: 1, approverType: 'ROLE', roleId: managerRole?.id, required: true }],
});
ok('an administrator can replace the default', good(replaced), status(replaced));
const after = rows((await t.org('GET', '/approval-policies')).payload).filter(
  (policy) => policy.domain === 'TIMESHEET' && policy.isDefault && policy.isActive,
);
ok(
  'and theirs becomes the only default',
  after.length === 1 && after[0]?.code === 'TS_HR',
  after.map((policy) => policy.code).join(', '),
);

finish();
