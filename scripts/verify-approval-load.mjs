import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const count = Number(process.env.APPROVAL_LOAD_COUNT ?? 1000);
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error('APPROVAL_LOAD_COUNT must be 1..1000');
const t = await tenant('approval-load', { defaultPolicies: false });
const role = t.roles.find((item) => item.code === 'ORG_ADMIN');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (item) => item.paid && !item.requiresAttachment,
);
const policy = await t.org('POST', '/approval-policies', {
  domain: 'LEAVE',
  code: 'LOAD_REVIEW',
  name: 'Load verification review',
  isDefault: true,
  steps: [{ stepNumber: 1, approverType: 'ROLE', roleId: role.id }],
});
if (!good(policy)) throw new Error('Cannot configure load verification routing.');
const people = Array.from({ length: count }, (_, i) => ({
  employeeId: randomUUID(),
  requestId: randomUUID(),
  balanceId: randomUUID(),
  number: `LOAD-${i + 1}`,
}));
const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query(
    `INSERT INTO employees (id, organization_id, employee_number, first_name, last_name, identity_source, employment_type, primary_branch_id, date_of_joining, updated_at)
  SELECT x."employeeId"::uuid, $2::uuid, x.number, 'Load', x.number, 'NATIVE', 'FULL_TIME', $3::uuid, '2026-01-01', now() FROM jsonb_to_recordset($1::jsonb) AS x("employeeId" text, number text)`,
    [JSON.stringify(people), t.orgId, t.branchId],
  );
  await db.query(
    `INSERT INTO leave_balances (id, organization_id, employee_id, leave_type_id, period_start, period_end, opening_amount, accrued_amount, used_amount, reserved_amount, available_amount, updated_at)
  SELECT x."balanceId"::uuid, $2::uuid, x."employeeId"::uuid, $3::uuid, '2026-01-01', '2026-12-31', 20, 0, 0, 1, 19, now() FROM jsonb_to_recordset($1::jsonb) AS x("employeeId" text, "balanceId" text)`,
    [JSON.stringify(people), t.orgId, type.id],
  );
  await db.query(
    `INSERT INTO leave_requests (id, organization_id, employee_id, branch_id, leave_type_id, approval_policy_id, start_date, end_date, requested_days, charged_dates, status, source_access_mode, submitted_at, updated_at)
  SELECT x."requestId"::uuid, $2::uuid, x."employeeId"::uuid, $3::uuid, $4::uuid, $5::uuid, '2026-11-16', '2026-11-16', 1, '["2026-11-16"]'::jsonb, 'PENDING', 'NATIVE', now(), now() FROM jsonb_to_recordset($1::jsonb) AS x("employeeId" text, "requestId" text)`,
    [JSON.stringify(people), t.orgId, t.branchId, type.id, policy.payload.id],
  );
  await db.query('COMMIT');
  const started = Date.now();
  let cursor;
  const seen = new Map();
  do {
    const page = await t.org(
      'GET',
      `/leave/requests/inbox?limit=100${cursor ? `&cursor=${cursor}` : ''}`,
    );
    if (!good(page)) throw new Error(page.payload?.detail || 'Inbox failed');
    for (const item of rows(page.payload)) seen.set(item.id, item);
    cursor = page.payload.nextCursor;
  } while (cursor);
  ok(
    'every assigned request appears across the real paginated inbox',
    seen.size === count,
    `${seen.size}/${count} in ${Date.now() - started} ms`,
  );
  const batchId = randomUUID();
  const batch = await t.org('POST', '/approval-batches', {
    batchId,
    status: 'APPROVED',
    items: [...seen.values()].map((item) => ({
      id: item.id,
      domain: 'LEAVE',
      expectedStepNumber: item.currentStep.stepNumber,
    })),
  });
  ok('one request starts a background batch for the complete selection', good(batch));
  let progress;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    progress = await t.org('GET', `/approval-batches/${batchId}`);
    if (['completed', 'failed'].includes(progress.payload?.state)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  ok(
    'background worker decides every request with individual outcomes',
    progress?.payload?.state === 'completed' &&
      progress.payload.processed === count &&
      progress.payload.results.every((item) => item.outcome === 'DECIDED'),
    `${progress?.payload?.processed ?? 0}/${count}; elapsed ${Date.now() - started} ms`,
  );
  const final = await db.query(
    'SELECT count(*)::int AS count FROM leave_requests WHERE organization_id = $1 AND approval_policy_id = $2 AND status = $3',
    [t.orgId, policy.payload.id, 'APPROVED'],
  );
  ok(
    'database confirms the complete batch finalized real leave requests',
    final.rows[0].count === count,
  );
} finally {
  await db.end();
}
finish();
