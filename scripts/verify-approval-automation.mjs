import { randomUUID } from 'node:crypto';
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const t = await tenant('automation', { defaultPolicies: false });
const role = t.roles.find((item) => item.code === 'ORG_ADMIN');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (item) => item.paid && Number(item.annualAllowance) >= 5 && !item.requiresAttachment,
);
if (!role || !type)
  throw new Error('Approval verification needs an administrator role and paid leave type.');
const explain = (result) =>
  `HTTP ${result.status}${result.payload?.detail ? ': ' + result.payload.detail : ''}`;
const steps = [{ stepNumber: 1, approverType: 'ROLE', roleId: role.id, required: true }];
const policy = await t.org('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: 'LEAVE_AUTO',
  name: 'Short leave automatically approved',
  isDefault: true,
  automation: {
    mode: 'CONDITIONAL',
    maxLeaveDays: 1,
    minNoticeDays: 0,
    branchIds: [t.branchId],
    leaveTypeIds: [type.id],
  },
  steps,
});
ok('administrator saves scoped conditional approval', good(policy), explain(policy));
if (!good(policy)) throw new Error('Cannot verify without a policy.');
const input = (who, startDate, endDate = startDate) => ({
  employeeId: who.id,
  leaveTypeId: type.id,
  startDate,
  endDate,
  reason: 'Automatic approval regression',
});
const preview = await t.a.as('POST', '/leave/requests/preview', input(t.a, '2026-11-16'));
ok(
  'employee sees authoritative cost and automatic eligibility before submitting',
  good(preview) && preview.payload?.requestedDays === 1 && preview.payload?.automaticallyApproved,
  explain(preview),
);
const automatic = await t.a.as('POST', '/leave/requests', input(t.a, '2026-11-16'));
ok(
  'eligible leave is immediately approved through the real balance workflow',
  good(automatic) && automatic.payload?.status === 'APPROVED',
  explain(automatic),
);
const mine = await t.a.as('GET', '/leave/requests');
ok(
  'requester can see the system decision explanation',
  rows(mine.payload).some(
    (item) =>
      item.id === automatic.payload?.id &&
      /Automatically approved/.test(item.decisionComment ?? ''),
  ),
);
const overlap = await t.a.as('POST', '/leave/requests', input(t.a, '2026-11-16'));
ok('automatic mode still refuses overlapping leave', overlap.status === 409, explain(overlap));
const long = await t.a.as('POST', '/leave/requests', input(t.a, '2026-11-17', '2026-11-18'));
ok(
  'leave outside the automatic limit is routed for review',
  good(long) && long.payload?.status === 'PENDING',
  explain(long),
);
const revised = await t.org('PATCH', `/approval-policies/${policy.payload.id}`, {
  automation: { mode: 'MANUAL' },
});
ok(
  'changing automation alone creates a new policy version after requests used it',
  good(revised) && revised.payload?.id !== policy.payload.id,
  explain(revised),
);
const pending = await t.b.as('POST', '/leave/requests', input(t.b, '2026-11-19'));
ok(
  'new requests respect manual settings',
  good(pending) && pending.payload?.status === 'PENDING',
  explain(pending),
);
const inbox = await t.org('GET', '/leave/requests/inbox?limit=100');
const inboxRows = rows(inbox.payload);
ok(
  'administrator sees both old-version and new-version pending requests',
  good(inbox) &&
    [long.payload?.id, pending.payload?.id].every((id) => inboxRows.some((item) => item.id === id)),
  explain(inbox),
);
const selected = inboxRows
  .filter((item) => [long.payload?.id, pending.payload?.id].includes(item.id))
  .map((item) => ({
    id: item.id,
    domain: 'LEAVE',
    expectedStepNumber: item.currentStep.stepNumber,
  }));
const impact = await t.org('POST', '/approval-policies/automation-preview', {
  domain: 'LEAVE',
  automation: { mode: 'CONDITIONAL', maxLeaveDays: 1 },
});
ok(
  'rule impact preview distinguishes eligible requests and manual exceptions',
  good(impact) &&
    impact.payload?.processed === 2 &&
    impact.payload?.eligible === 1 &&
    impact.payload?.manual === 1,
  explain(impact),
);
const unchanged = rows((await t.org('GET', '/leave/requests/inbox?limit=100')).payload);
ok(
  'rule impact preview records no decisions',
  selected.every((item) => unchanged.some((row) => row.id === item.id && row.status === 'PENDING')),
);
const batchId = randomUUID();
const batchBody = { batchId, status: 'APPROVED', items: selected };
const batch = await t.org('POST', '/approval-batches', batchBody);
ok(
  'administrator starts a background batch with no compulsory comment',
  good(batch),
  explain(batch),
);
if (good(batch)) {
  let progress;
  for (let count = 0; count < 40; count++) {
    progress = await t.org('GET', `/approval-batches/${batchId}`);
    if (['completed', 'failed'].includes(progress.payload?.state)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  ok(
    'worker records every selected decision and reports completion',
    progress.payload?.state === 'completed' &&
      progress.payload?.processed === 2 &&
      progress.payload.results.every((item) => item.outcome === 'DECIDED'),
    JSON.stringify(progress.payload),
  );
  const repeat = await t.org('POST', '/approval-batches', batchBody);
  ok(
    'retrying the same batch restores its result',
    good(repeat) && repeat.payload?.processed === 2,
    explain(repeat),
  );
  const denied = await t.a.as('GET', `/approval-batches/${batchId}`);
  ok('another user cannot read the administrator’s batch', refused(denied), explain(denied));
  const different = await t.org('POST', '/approval-batches', {
    ...batchBody,
    status: 'REJECTED',
    comment: 'Different payload',
  });
  ok(
    'reusing a batch ID for different decisions is refused',
    different.status === 409,
    explain(different),
  );
}
const year = await t.b.as(
  'POST',
  '/leave/requests/preview',
  input(t.b, '2026-12-31', '2027-01-02'),
);
ok(
  'preview explains the split required across leave years',
  year.status === 409 && /Split/.test(year.payload?.detail ?? ''),
  explain(year),
);
const employeePolicy = await t.a.as('PATCH', `/approval-policies/${revised.payload?.id}`, {
  automation: { mode: 'AUTOMATIC' },
});
ok(
  'an employee cannot enable automatic approval',
  refused(employeePolicy),
  explain(employeePolicy),
);

const attendancePolicy = await t.org('POST', '/approval-policies', {
  domain: 'ATTENDANCE_CORRECTION',
  code: 'ATTENDANCE_AUTO',
  name: 'Small punch corrections',
  isDefault: true,
  automation: {
    mode: 'CONDITIONAL',
    maxCorrectionAgeDays: 7,
    maxChangedMinutes: 10,
    maxCorrectionsPerMonth: 2,
  },
  steps,
});
ok(
  'administrator configures conditional attendance approval',
  good(attendancePolicy),
  explain(attendancePolicy),
);
const checkInAt = new Date(Date.now() - 5 * 60000).toISOString();
const checkOutAt = new Date(Date.now() - 60000).toISOString();
const punchBody = { employeeId: t.a.id, branchId: t.branchId, workDate: t.today };
const checkIn = await t.a.as('POST', '/attendance/check-ins', {
  ...punchBody,
  occurredAt: checkInAt,
});
const checkOut = await t.a.as('POST', '/attendance/check-outs', {
  ...punchBody,
  occurredAt: checkOutAt,
});
ok(
  'employee records real punches for the attendance scenario',
  good(checkIn) && good(checkOut),
  explain(checkOut),
);
const records = rows((await t.a.as('GET', '/attendance')).payload);
const record = records.find(
  (item) => item.employeeId === t.a.id && item.workDate.slice(0, 10) === t.today,
);
if (record) {
  const small = await t.a.as('POST', `/attendance/${record.id}/corrections`, {
    reason: 'Small clock discrepancy',
    afterSnapshot: { correctedCheckIn: new Date(Date.parse(checkInAt) - 60000).toISOString() },
  });
  ok(
    'small correction is automatically approved and updates real punches',
    good(small) && small.payload?.status === 'APPROVED',
    explain(small),
  );
  const updatedRecord = rows((await t.a.as('GET', '/attendance')).payload).find(
    (item) => item.id === record.id,
  );
  ok(
    'approved correction actually changes the attendance punch',
    updatedRecord?.punches.some(
      (item) => item.occurredAt === new Date(Date.parse(checkInAt) - 60000).toISOString(),
    ),
  );
  const large = await t.a.as('POST', `/attendance/${record.id}/corrections`, {
    reason: 'Larger clock discrepancy',
    afterSnapshot: { correctedCheckIn: new Date(Date.parse(checkInAt) - 30 * 60000).toISOString() },
  });
  ok(
    'larger correction is routed for human review',
    good(large) && large.payload?.status === 'PENDING',
    explain(large),
  );
}
finish();
