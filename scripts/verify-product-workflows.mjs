import { createRequire } from 'node:module';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const t = await tenant('workflows');
const role = t.roles.find((item) => item.code === 'ORG_ADMIN');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (item) => item.paid && !item.requiresAttachment && Number(item.annualAllowance) >= 5,
);
const explain = (r) => `HTTP ${r.status}: ${r.payload?.detail ?? ''}`;
await t.org('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: 'WORKFLOW_LEAVE',
  name: 'Leave review',
  isDefault: true,
  steps: [{ stepNumber: 1, approverType: 'ROLE', roleId: role.id }],
});
const apply = (day, session = 'FULL_DAY') =>
  t.a.as('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: type.id,
    startDate: day,
    endDate: day,
    session,
    reason: 'Product workflow verification',
  });
const first = await apply('2026-11-16', 'FIRST_HALF');
ok(
  'employee requests half-day leave and reserves exactly 0.5 days',
  good(first) &&
    Number(first.payload?.requestedDays) === 0.5 &&
    first.payload?.session === 'FIRST_HALF',
  explain(first),
);
const same = await apply('2026-11-16', 'FIRST_HALF');
ok('same-session overlap is refused', same.status === 409);
const second = await apply('2026-11-16', 'SECOND_HALF');
ok(
  'opposite half-day sessions coexist without exceeding a day',
  good(second) && Number(second.payload?.requestedDays) === 0.5,
  explain(second),
);
const multi = await t.a.as('POST', '/leave/requests/preview', {
  employeeId: t.a.id,
  leaveTypeId: type.id,
  startDate: '2026-11-17',
  endDate: '2026-11-18',
  session: 'FIRST_HALF',
});
ok('half-day preview rejects multiple dates with an explanation', multi.status === 409);
for (const request of [first, second]) {
  const accepted = await t.org('POST', `/leave/requests/${request.payload?.id}/decision`, {
    status: 'APPROVED',
  });
  ok(
    'normal approval finalizes a half-day request',
    good(accepted) && accepted.payload?.status === 'APPROVED',
    explain(accepted),
  );
}
const rules = await t.org('PUT', '/leave/workflows/settings', {
  futureCancellation: 'REVIEW',
  minimumNoticeDays: 2,
  startedCancellation: 'REVIEW',
});
ok('HR saves explicit cancellation rules', good(rules), explain(rules));
const cannotConfigure = await t.a.as('PUT', '/leave/workflows/settings', {
  futureCancellation: 'IMMEDIATE',
  minimumNoticeDays: 0,
  startedCancellation: 'DISABLED',
});
ok('employee cannot weaken cancellation settings', refused(cannotConfigure));
const beforeBalance = rows((await t.a.as('GET', '/leave/balances')).payload).find(
  (item) => item.leaveTypeId === type.id,
);
const cancelled = await t.a.as('POST', `/leave/requests/${first.payload?.id}/cancel`, {
  reason: 'Plans changed; please review cancellation',
});
ok(
  'cancellation request keeps leave approved while awaiting HR',
  good(cancelled) &&
    cancelled.payload?.status === 'APPROVED' &&
    cancelled.payload?.cancellation?.status === 'PENDING',
  explain(cancelled),
);
const afterBalance = rows((await t.a.as('GET', '/leave/balances')).payload).find(
  (item) => item.leaveTypeId === type.id,
);
ok(
  'pending cancellation does not refund entitlement early',
  Number(beforeBalance?.usedAmount) === Number(afterBalance?.usedAmount),
);
const list = await t.org('GET', '/leave/workflows/cancellations');
ok(
  'HR sees the cancellation and employee reason',
  good(list) && list.payload.items.some((item) => item.id === first.payload.id),
  explain(list),
);
const employeeInbox = await t.a.as('GET', '/leave/workflows/cancellations');
ok('employee cannot browse cancellation review inbox', refused(employeeInbox));
const cancelDecision = await t.org(
  'POST',
  `/leave/workflows/cancellations/${first.payload?.id}/decision`,
  { status: 'APPROVED' },
);
ok(
  'HR acceptance reverses exactly one half-day',
  good(cancelDecision) && cancelDecision.payload?.status === 'CANCELLED',
  explain(cancelDecision),
);
const restored = rows((await t.a.as('GET', '/leave/balances')).payload).find(
  (item) => item.leaveTypeId === type.id,
);
ok(
  'approved cancellation refunds exactly 0.5 days',
  Number(restored?.availableAmount) === Number(beforeBalance?.availableAmount) + 0.5,
);
const repeat = await t.org('POST', `/leave/workflows/cancellations/${first.payload?.id}/decision`, {
  status: 'APPROVED',
});
ok('retry cannot refund cancellation twice', repeat.status >= 400);
const records = rows((await t.a.as('GET', '/attendance')).payload);
ok(
  'cancelling one half preserves attendance for the other approved half',
  records.some(
    (item) => item.workDate.slice(0, 10) === '2026-11-16' && item.dayStatus === 'ON_LEAVE',
  ),
);
const readiness = await t.org('GET', '/employee-operations/readiness');
ok(
  'HR can see actionable setup gaps',
  good(readiness) &&
    readiness.payload.items
      .find((item) => item.id === t.a.id)
      ?.issues.some((item) => item.code === 'PAYROLL'),
  explain(readiness),
);
const managerBody = {
  kind: 'MANAGER',
  employeeIds: [t.a.id],
  targetId: t.b.id,
  reason: 'Set reporting line after onboarding',
};
const preview = await t.org('POST', '/employee-operations/preview', managerBody);
ok(
  'bulk setup previews each selected employee',
  good(preview) && preview.payload.valid === 1,
  explain(preview),
);
const stale = await t.org('POST', '/employee-operations/apply', {
  ...managerBody,
  fingerprint: 'old-preview',
});
ok('bulk setup refuses stale previews', stale.status === 409);
const applied = await t.org('POST', '/employee-operations/apply', {
  ...managerBody,
  fingerprint: preview.payload?.fingerprint,
});
ok(
  'previewed manager assignment actually saves',
  good(applied) && applied.payload.results[0]?.outcome === 'APPLIED',
  explain(applied),
);
const shift = await t.org('POST', '/shifts', {
  name: 'Workflow day shift',
  daysOfWeek: [1, 2, 3, 4, 5],
  startsAt: '09:00',
  endsAt: '18:00',
  crossesMidnight: false,
  breakMinutes: 60,
});
const shiftBody = {
  kind: 'SHIFT',
  employeeIds: [t.a.id, t.b.id],
  targetId: shift.payload?.id,
  startsOn: '2026-11-01',
  reason: 'Publish employee work schedules',
};
const shiftPreview = await t.org('POST', '/employee-operations/preview', shiftBody);
const shiftApplied = await t.org('POST', '/employee-operations/apply', {
  ...shiftBody,
  fingerprint: shiftPreview.payload?.fingerprint,
});
ok(
  'bulk shift publication saves both rows with per-person results',
  good(shiftApplied) && shiftApplied.payload.results.every((item) => item.outcome === 'APPLIED'),
  explain(shiftApplied),
);
const prefs = await t.a.as('PUT', '/notifications/preferences', {
  email: true,
  delivery: 'DAILY_DIGEST',
});
ok(
  'employee can choose daily digest delivery',
  good(prefs) && prefs.payload.delivery === 'DAILY_DIGEST',
  explain(prefs),
);
const savedPrefs = await t.a.as('GET', '/notifications/preferences');
ok('digest preference persists across requests', savedPrefs.payload?.delivery === 'DAILY_DIGEST');
const oldPending = await apply('2026-11-24');
const existingRules = {
  domain: 'LEAVE',
  automation: { mode: 'CONDITIONAL', maxLeaveDays: 1 },
  ids: [oldPending.payload.id],
  reason: 'Apply short leave automation to existing requests',
};
const cannotApply = await t.a.as(
  'POST',
  '/approval-policies/automation-apply-existing',
  existingRules,
);
ok('employee cannot apply automation to existing approvals', refused(cannotApply));
const retro = await t.org('POST', '/approval-policies/automation-apply-existing', existingRules);
ok(
  'administrator explicitly applies rules to eligible existing requests',
  good(retro) && retro.payload.approved === 1,
  explain(retro),
);
const retryRules = await t.org(
  'POST',
  '/approval-policies/automation-apply-existing',
  existingRules,
);
ok(
  'replaying existing automation does not finalize or refund twice',
  good(retryRules) &&
    retryRules.payload.approved === 0 &&
    retryRules.payload.results[0]?.outcome === 'SKIPPED',
  explain(retryRules),
);
const pendingLong = await t.b.as('POST', '/leave/requests', {
  employeeId: t.b.id,
  leaveTypeId: type.id,
  startDate: '2026-11-25',
  endDate: '2026-11-26',
  reason: 'Long leave requires review',
});
const outsideRules = await t.org('POST', '/approval-policies/automation-apply-existing', {
  ...existingRules,
  ids: [pendingLong.payload.id],
});
ok(
  'existing rules retain out-of-limit leave for review',
  good(outsideRules) && outsideRules.payload.approved === 0,
  explain(outsideRules),
);
const run = await t.org('POST', '/payroll/runs', {
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
});
const ready = await t.org('GET', `/payroll/runs/${run.payload?.id}/readiness`);
ok(
  'payroll readiness identifies employees without effective pay setup',
  good(ready) && ready.payload.blockers.some((item) => item.code === 'MISSING_PAY_SETUP'),
  explain(ready),
);
const payDenied = await t.a.as('GET', `/payroll/runs/${run.payload?.id}/readiness`);
ok('employee cannot inspect payroll readiness for colleagues', refused(payDenied));
const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
try {
  await db.query(
    "UPDATE attendance_records SET worked_minutes = 300, scheduled_minutes = 480 WHERE organization_id = $1 AND employee_id = $2 AND work_date = '2026-11-16'",
    [t.orgId, t.a.id],
  );
  const conflict = await t.org('GET', `/payroll/runs/${run.payload.id}/readiness`);
  ok(
    'payroll identifies work exceeding the remaining half-day after leave',
    good(conflict) && conflict.payload.blockers.some((item) => item.code === 'WORK_DURING_LEAVE'),
    explain(conflict),
  );
  await db.query(
    "UPDATE attendance_records SET worked_minutes = 0 WHERE organization_id = $1 AND employee_id = $2 AND work_date = '2026-11-16'",
    [t.orgId, t.a.id],
  );
  await db.query(
    "UPDATE payroll_runs SET status = 'CALCULATED' WHERE id = $1 AND organization_id = $2",
    [run.payload.id, t.orgId],
  );
  const blockedApproval = await t.org('POST', `/payroll/runs/${run.payload.id}/action`, {
    target: 'APPROVED',
    comment: 'Readiness must be enforced on approval',
  });
  ok(
    'payroll approval rechecks and rejects unresolved readiness blockers',
    blockedApproval.status === 409,
  );
  // Only this verification tenant's run is changed to construct a released-period boundary.
  await db.query(
    "UPDATE payroll_runs SET status = 'RELEASED', released_at = now() WHERE id = $1 AND organization_id = $2",
    [run.payload.id, t.orgId],
  );
  const blocked = await t.a.as('POST', `/leave/requests/${second.payload.id}/cancel`, {
    reason: 'Historical change needs payroll correction',
  });
  ok('released payroll refuses direct historical leave changes', blocked.status === 409);
  const corrected = await t.org('POST', `/payroll/runs/${run.payload.id}/correct`, {
    reason: 'Authorized payroll correction for historical leave',
  });
  ok(
    'payroll opens an audited replacement without deleting the original',
    good(corrected) &&
      corrected.payload?.superseded?.status === 'CORRECTED' &&
      corrected.payload?.replacement?.status === 'DRAFT',
    explain(corrected),
  );
  const cancellation = await t.a.as('POST', `/leave/requests/${second.payload.id}/cancel`, {
    reason: 'Apply change while correction period is open',
  });
  ok(
    'open replacement permits the ordinary cancellation review path',
    good(cancellation) && cancellation.payload?.cancellation?.status === 'PENDING',
    explain(cancellation),
  );
} finally {
  await db.end();
}
finish();
