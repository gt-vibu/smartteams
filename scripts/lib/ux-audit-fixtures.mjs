import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl } from './database-url.mjs';
import { good, rows } from './authz-harness.mjs';

/** Synthetic list fixtures belong exclusively to the new audit tenant; these aren't payroll calculations. */
export async function seedUxLists(t) {
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
  const { Client } = require('pg');
  const db = new Client({ connectionString: resolveDatabaseUrl() });
  const people = Array.from({ length: 120 }, (_, i) => ({
    id: randomUUID(),
    number: `UX-${String(i).padStart(3, '0')}`,
    attendance: randomUUID(),
    leave: randomUUID(),
  }));
  const types = await t.org('GET', '/leave/types');
  const type = rows(types.payload).find((item) => item.paid && !item.requiresAttachment);
  if (!type) throw new Error('Audit tenant must have an ordinary leave type');
  await db.connect();
  try {
    await db.query(
      `INSERT INTO employees (id, organization_id, employee_number, first_name, last_name, identity_source, employment_type, primary_branch_id, date_of_joining, updated_at)
      SELECT x.id::uuid, $2::uuid, x.number, 'Audit', x.number, 'NATIVE', 'FULL_TIME', $3::uuid, '2026-01-01', now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, number text)`,
      [JSON.stringify(people), t.orgId, t.branchId],
    );
    await db.query(
      `INSERT INTO attendance_records (id, organization_id, employee_id, branch_id, work_date, source_access_mode, status, day_status, worked_minutes, updated_at)
      SELECT x.attendance::uuid, $2::uuid, x.id::uuid, $3::uuid, $4::date, 'NATIVE', 'COMPLETED', 'PRESENT', 480, now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, attendance text)`,
      [JSON.stringify(people), t.orgId, t.branchId, t.today],
    );
    await db.query(
      `INSERT INTO leave_requests (id, organization_id, employee_id, branch_id, leave_type_id, start_date, end_date, requested_days, source_access_mode, status, updated_at)
      SELECT x.leave::uuid, $2::uuid, x.id::uuid, $3::uuid, $4::uuid, '2026-11-16', '2026-11-16', 1, 'NATIVE', 'PENDING', now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, leave text)`,
      [JSON.stringify(people), t.orgId, t.branchId, type.id],
    );
  } finally {
    await db.end();
  }
  const manager = t.roles.find((role) => role.code === 'MANAGER');
  if (
    !manager ||
    !good(await t.org('POST', '/role-assignments', { userId: t.b.userId, roleId: manager.id }))
  )
    throw new Error('Cannot prepare manager role');
  const assigned = await t.org('PUT', `/employees/${t.a.id}/manager`, {
    managerEmployeeId: t.b.id,
  });
  if (!good(assigned)) throw new Error('Cannot prepare reporting line');
  await t.org('POST', '/approval-policies', {
    domain: 'LEAVE',
    code: 'UX_MANAGER',
    name: 'Manager review',
    isDefault: true,
    steps: [{ stepNumber: 1, approverType: 'MANAGER', required: true }],
  });
  const request = await t.a.as('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: type.id,
    startDate: '2026-11-17',
    endDate: '2026-11-17',
    reason: 'User journey review',
  });
  if (!good(request))
    throw new Error(`Cannot prepare real manager request: HTTP ${request.status}`);
  return people;
}

export const extraUxCases = {
  admin: [
    ...['people', 'departments', 'lists', 'reporting', 'branches', 'access', 'profile'].map(
      (tab) => ['home', `orgSection=${tab}`],
    ),
    ...['former', 'exits', 'probation', 'fields'].map((tab) => ['employees', `people=${tab}`]),
    ['time-off', 'leaveTab=balances'],
    ['time-off', 'leaveTab=types'],
    ['attendance', 'attendanceTab=corrections'],
    ['attendance', 'attendanceTab=policy'],
    ...['EMPLOYEE_PAY', 'COMPENSATION', 'STATUTORY'].map((tab) => [
      'payroll',
      `payrollAdminTab=${tab}`,
    ]),
    ['payroll', 'payrollAdminTab=COMPENSATION&compensationTab=catalog'],
    ...[
      'Workload',
      'Delegation',
      'Approval workflows',
      'Routing exceptions',
      'Leave cancellations',
    ].map((tab) => ['approvals', '', [tab]]),
    ...['Attendance', 'Leave', 'Project hours'].map((tab) => ['reports', '', [tab]]),
    ...['Employee files', 'Team files', 'Project files'].map((tab) => ['files', '', [tab]]),
  ],
  employee: [
    ['home', 'overviewTab=Dashboard'],
    ['home', 'overviewTab=Calendar'],
    ['home', 'overviewSection=Profile'],
    ['attendance', 'view=table'],
    ['attendance', 'view=calendar'],
    ['payroll', 'payrollTab=payslips'],
    ['payroll', 'payrollTab=advances'],
    ...['Shared with me', 'Company', 'My teams', 'My projects'].map((tab) => ['files', '', [tab]]),
  ],
};
