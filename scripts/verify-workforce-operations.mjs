import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { tenant, good, refused, ok, finish } from './lib/authz-harness.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const t = await tenant('workforce-scale');
const detail = (result) => `HTTP ${result.status} ${JSON.stringify(result.payload).slice(0, 250)}`;
const people = Array.from({ length: 10000 }, (_, i) => ({
  id: randomUUID(),
  number: `BULK-${String(i + 1).padStart(5, '0')}`,
}));
const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
try {
  await db.query(
    `INSERT INTO employees (id, organization_id, employee_number, first_name, last_name, identity_source, employment_type, primary_branch_id, date_of_joining, updated_at)
    SELECT x.id::uuid, $2::uuid, x.number, 'Bulk', x.number, 'NATIVE', 'FULL_TIME', $3::uuid, '2026-01-01', now()
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, number text)`,
    [JSON.stringify(people), t.orgId, t.branchId],
  );
  const options = await t.org('GET', '/workforce/options?operation=MANAGER');
  ok('administrator can access filtered staff setup', good(options), detail(options));
  const body = {
    operation: 'MANAGER',
    targetId: t.b.id,
    effectiveFrom: t.today,
    reason: 'Publish reporting manager for new team',
    filter: { search: 'BULK-', allEmployees: true },
  };
  const startTime = Date.now();
  const large = await t.org('POST', '/workforce/preview', body);
  ok(
    '10,000-employee group preview returns exactly 100 displayed rows',
    good(large) && large.payload.total === 10000 && large.payload.rows.length === 100,
    detail(large),
  );
  console.log(`10,000-person preview: ${Date.now() - startTime} ms`);
  const all = await t.org('POST', '/workforce/preview', {
    ...body,
    filter: { allEmployees: true },
  });
  ok('selection above 10,000 is refused before enqueueing', all.status === 409);
  const last = await t.org('GET', '/workforce/people?search=BULK-10000');
  ok(
    'search finds staff beyond the first page',
    good(last) && last.payload.total === 1 && last.payload.items[0].employeeNumber === 'BULK-10000',
  );
  const denied = await t.a.as('POST', '/workforce/preview', body);
  ok('ordinary employee cannot preview coworkers or assign payroll', refused(denied));
  const batchBody = {
    ...body,
    filter: { employeeIds: people.slice(0, 1000).map((person) => person.id) },
  };
  const plan = await t.org('POST', '/workforce/preview', batchBody);
  const batchId = randomUUID();
  const stale = await t.org('POST', '/workforce/jobs', {
    ...batchBody,
    batchId,
    fingerprint: '0'.repeat(64),
  });
  ok('stale preview is refused', stale.status === 409);
  const job = await t.org('POST', '/workforce/jobs', {
    ...batchBody,
    batchId,
    fingerprint: plan.payload.fingerprint,
  });
  ok('1,000-employee assignment runs as a background job', good(job), detail(job));
  if (!good(job)) throw new Error('Assignment job was not accepted');
  const begun = Date.now();
  let state;
  do {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await t.org('GET', `/workforce/jobs/${batchId}`);
    if (!good(result)) throw new Error(detail(result));
    state = result.payload;
    if (Date.now() - begun > 300000) throw new Error('Assignment job exceeded five minutes');
  } while (!['completed', 'failed'].includes(state.state));
  ok(
    'all 1,000 rows apply and progress response remains paged',
    state.applied === 1000 &&
      state.failed === 0 &&
      state.results.length === 100 &&
      state.nextOffset === 100,
    JSON.stringify({ ...state, results: state.results.slice(0, 2) }),
  );
  console.log(`1,000 actual manager assignments: ${Date.now() - begun} ms`);
  const saved = await db.query(
    'SELECT count(*)::int AS count FROM employees WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND manager_employee_id = $3',
    [t.orgId, batchBody.filter.employeeIds, t.b.id],
  );
  ok('all manager assignments persisted in the database', saved.rows[0].count === 1000);
  const replay = await t.org('POST', '/workforce/jobs', {
    ...batchBody,
    batchId,
    fingerprint: plan.payload.fingerprint,
  });
  ok(
    'same job ID resumes saved results instead of applying twice',
    good(replay) && replay.payload.applied === 1000,
  );
  const hidden = await t.a.as('GET', `/workforce/jobs/${batchId}`);
  ok('assignment results are private to authorized creator', refused(hidden));
  const csv = await t.org('GET', `/workforce/jobs/${batchId}/results.csv`);
  ok(
    'CSV includes all results rather than the displayed page',
    csv.status === 200 && csv.text.split('\r\n').length === 1001,
  );
  const retry = await t.org('GET', `/workforce/jobs/${batchId}/retry-preview`);
  ok('successful assignments cannot be retried as failed rows', retry.status === 409);
  const analytics = await t.org('GET', '/approval-operations/analytics');
  ok(
    'workload metrics read real authorized request counts',
    good(analytics) && analytics.payload.rows.length === 2,
    detail(analytics),
  );
  const privacy = await t.a.as('GET', '/approval-operations/analytics');
  ok('employee cannot read organization approval analytics', refused(privacy));
  const candidates = await t.org('GET', '/approval-policies/approver-search?search=Case');
  ok(
    'approver search returns eligible names with paging',
    good(candidates) && candidates.payload.items.some((item) => item.userId === t.a.userId),
    detail(candidates),
  );
  const defaults = await t.org('GET', '/payroll/policy');
  const policy = await t.org('PUT', '/payroll/policy', {
    name: 'Staff payroll',
    effectiveFrom: '2026-01-01',
    salarySlipDefault: true,
    payrollEnabledDefault: true,
    payrollDayBasis: 30,
    basePercentage: 50,
    baseMinimum: 15000,
    hraPercentage: 40,
    pfDefault: false,
    esiDefault: false,
    ptDefault: false,
    roundingMode: defaults.payload.roundingMode,
  });
  ok('shared payroll policy can be configured', good(policy), detail(policy));
  const role = t.roles.find((role) => role.code === 'EMPLOYEE');
  const override = await t.org('PUT', '/payroll/employee-policy', {
    employeeId: t.a.id,
    effectiveFrom: '2026-01-01',
    payrollEnabled: true,
    salarySlipMode: 'DISABLED',
    pfEnabled: true,
    esiEnabled: false,
    ptEnabled: true,
    payrollPolicyId: policy.payload.id,
  });
  ok('individual statutory and payslip overrides are configured', good(override), detail(override));
  const payrollBody = {
    operation: 'PAYROLL_POLICY',
    targetId: policy.payload.id,
    effectiveFrom: t.today,
    reason: 'Apply shared payroll to the staff role',
    filter: { roleId: role.id },
  };
  const payPreview = await t.org('POST', '/workforce/preview', payrollBody);
  ok(
    'role-based payroll selects the two active staff memberships',
    good(payPreview) && payPreview.payload.total === 2,
    detail(payPreview),
  );
  if (good(payPreview)) {
    const payId = randomUUID();
    const started = await t.org('POST', '/workforce/jobs', {
      ...payrollBody,
      fingerprint: payPreview.payload.fingerprint,
      batchId: payId,
    });
    ok('role-based payroll assignment starts', good(started), detail(started));
    let result;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      result = await t.org('GET', `/workforce/jobs/${payId}`);
      if (['completed', 'failed'].includes(result.payload?.state)) break;
    }
    ok(
      'role-based payroll assignments persist for both employees',
      result.payload?.applied === 2 && result.payload?.failed === 0,
      detail(result),
    );
  }
  const flags = await db.query(
    'SELECT salary_slip_mode, pf_enabled, pt_enabled FROM employee_payroll_policies WHERE organization_id = $1 AND employee_id = $2 AND effective_from = $3',
    [t.orgId, t.a.id, t.today],
  );
  ok(
    'shared policy assignment preserves individual statutory and payslip choices',
    flags.rows[0]?.salary_slip_mode === 'DISABLED' &&
      flags.rows[0]?.pf_enabled &&
      flags.rows[0]?.pt_enabled,
  );
  const partialBody = { ...body, filter: { employeeIds: [t.a.id, t.b.id] } };
  const partialPreview = await t.org('POST', '/workforce/preview', partialBody);
  ok(
    'self-reporting row is reported in preview rather than hiding the valid row',
    partialPreview.payload?.valid === 1 && partialPreview.payload?.invalid === 1,
  );
  const partialId = randomUUID();
  await t.org('POST', '/workforce/jobs', {
    ...partialBody,
    fingerprint: partialPreview.payload.fingerprint,
    batchId: partialId,
  });
  let partial;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    partial = await t.org('GET', `/workforce/jobs/${partialId}`);
    if (partial.payload?.state === 'completed') break;
  }
  ok(
    'partial assignment leaves an explicit per-row failure',
    partial.payload?.applied === 1 && partial.payload?.failed === 1,
    detail(partial),
  );
  const remaining = await t.org('GET', `/workforce/jobs/${partialId}/retry-preview`);
  ok(
    'retry preview includes only failed rows and revalidates current setup',
    good(remaining) &&
      remaining.payload.input.filter.employeeIds.length === 1 &&
      remaining.payload.input.filter.employeeIds[0] === t.b.id &&
      remaining.payload.preview.invalid === 1,
    detail(remaining),
  );
  const leaveOptions = await t.org('GET', '/workforce/options?operation=LEAVE_POLICY');
  const leaveBody = {
    operation: 'LEAVE_POLICY',
    targetId: leaveOptions.payload.targets[0].id,
    effectiveFrom: t.today,
    reason: 'Make leave available to this branch',
    filter: { branchId: t.branchId },
  };
  const branchPreview = await t.org('POST', '/workforce/preview', leaveBody);
  ok(
    'branch leave preview counts all 10,002 active employees',
    good(branchPreview) && branchPreview.payload.affectedEmployees === 10002,
  );
  const shift = await t.org('POST', '/shifts', {
    name: 'Published schedule',
    daysOfWeek: [1, 2, 3, 4, 5],
    startsAt: '09:00',
    endsAt: '18:00',
    crossesMidnight: false,
    breakMinutes: 60,
  });
  const fallback = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
    shiftId: shift.payload.id,
    startsOn: t.today,
  });
  ok('published shift can be assigned', good(fallback), detail(fallback));
  if (good(fallback)) {
    const edited = await t.org('PATCH', `/shifts/${shift.payload.id}`, { startsAt: '08:00' });
    ok('assigned schedule cannot silently change history', edited.status === 409, detail(edited));
    const retired = await t.org('POST', `/shifts/${shift.payload.id}/deactivate`, {
      reason: 'Retire schedule only after reassignment',
    });
    ok(
      'deactivation requires replacing current assignments first',
      retired.status === 409,
      detail(retired),
    );
  }
} finally {
  await db.end();
}
finish();
