import type { Prisma } from '../../generated/prisma/client';

export const EMPLOYEE_SELF_SERVICE_PERMISSIONS = [
  'organizations.read',
  'employees.read',
  'attendance.read',
  'attendance.write',
  'attendance.corrections.write',
  'attendance.preferences.read',
  'leave.types.read',
  'leave.requests.read',
  'leave.requests.write',
  'leave.balances.read',
  'timesheets.read',
  'timesheets.write',
  'timesheets.submit',
  'payroll.payslips.read',
  'payroll.employee-profile.read',
  'payroll.preview.read',
  'payroll.advances.read',
  'payroll.advances.request',
  'files.read',
  'files.write',
  'teams.read',
  'projects.read',
  'shifts.read',
] as const;

/**
 * A line manager: their own records, plus the ability to decide what their reports send them.
 *
 * PRD FR-11 requires Manager and HR Admin alongside Organization Admin and Employee. Only the
 * first and last were seeded, which left the middle of the permission model — the `.all` versus
 * self-scoped split — untested by any real role and unusable without hand-building one.
 *
 * A manager gets decision permissions, not organization-wide read: approval routing already
 * resolves who reports to them, so breadth comes from the reporting line rather than from a
 * blanket `.all`.
 */
export const MANAGER_PERMISSIONS = [
  ...EMPLOYEE_SELF_SERVICE_PERMISSIONS,
  'leave.requests.decide',
  'attendance.corrections.decide',
  'timesheets.decide',
  'rbac.read',
] as const;

/**
 * HR: the people-operations role. Organization-wide employee, attendance, leave and timesheet
 * access, and the ability to onboard — but no payroll release, no role administration and no
 * organization settings. Those stay with the administrator.
 */
export const HR_ADMIN_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'employees.read.all',
  'employees.write',
  'employees.branches.write',
  'attendance.read.all',
  'leave.requests.read.all',
  'leave.balances.read.all',
  'leave.balances.adjust',
  'leave.types.write',
  'timesheets.read.all',
  'files.read.all',
  'branches.read',
  'shifts.write',
  'members.read',
  'members.write',
  'rbac.write',
] as const;

/**
 * The three non-administrator roles every organization needs, seeded at creation.
 *
 * Shared because it was not. Platform onboarding seeded these; self-service registration created
 * only `ORG_ADMIN`. A tenant that signed itself up therefore had exactly one role — the wildcard
 * one — so the onboarding form could not find an `EMPLOYEE` role to give a new joiner, reported
 * that it "could not read the Employee role", and quietly created employees with no login at all.
 * Two ways to make a tenant must not produce two different tenants.
 *
 * `ORG_ADMIN` stays with each caller: onboarding upserts it against an existing organization,
 * registration creates it fresh, and the wildcard permission it carries is handled differently in
 * each. Only the roles that are identical in both live here.
 */
export async function seedStandardRoles(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const grant = async (roleId: string, keys: readonly string[]) => {
    for (const key of keys) {
      // `Permission.key` is globally unique and shared across tenants, so it is upserted rather
      // than created; the authority is scoped by the role that carries it, never by the row.
      const permission = await tx.permission.upsert({
        where: { key },
        create: { key, description: key },
        update: {},
      });
      await tx.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    }
  };

  for (const [code, name, description, keys] of [
    [
      'EMPLOYEE',
      'Employee',
      'Self-service access to your own records',
      EMPLOYEE_SELF_SERVICE_PERMISSIONS,
    ],
    ['MANAGER', 'Manager', 'Approves what their reports submit', MANAGER_PERMISSIONS],
    ['HR_ADMIN', 'HR Admin', 'People operations across the organization', HR_ADMIN_PERMISSIONS],
  ] as const) {
    const role = await tx.role.create({
      data: { organizationId, code, name, description, scope: 'ORGANIZATION', isSystem: true },
    });
    await grant(role.id, keys);
  }
}

/**
 * The minimum configuration a tenant needs before leave is usable at all.
 *
 * Without these a brand-new organization looks broken rather than empty: an employee opens Leave,
 * finds no types to pick from, and if an administrator creates one the request is still refused
 * with "configure a default leave approval policy first". Three separate setup steps stood
 * between a new tenant and its first day off, none of them prompted anywhere in the product.
 *
 * The types below are the ordinary Indian set and are all paid, matching the tenant defaults
 * (`Asia/Kolkata`, INR). They are starting points an administrator edits, not policy this code is
 * asserting — which is why allowances are round numbers and nothing here is marked `isSystem`.
 */
export async function seedLeaveDefaults(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  approverRoleId: string,
): Promise<void> {
  const types = [
    { code: 'CASUAL', name: 'Casual Leave', annualAllowance: 12 },
    { code: 'SICK', name: 'Sick Leave', annualAllowance: 12 },
    { code: 'EARNED', name: 'Earned Leave', annualAllowance: 15 },
  ];

  for (const type of types) {
    const created = await tx.leaveType.create({
      data: {
        organizationId,
        code: type.code,
        name: type.name,
        paid: true,
        accrualType: 'FIXED_ANNUAL',
        annualAllowance: type.annualAllowance,
        requiresAttachment: false,
      },
    });
    // A type is only requestable at branches it is assigned to, so seeding the type without the
    // assignment would leave the same dead end one step further along.
    await tx.leavePolicyAssignment.create({
      data: { organizationId, branchId, leaveTypeId: created.id, sourceAccessMode: 'NATIVE' },
    });
  }

  // Routed to the administrator role rather than to a person: the tenant's first administrator
  // may later be replaced, and a policy pointing at a departed user approves nothing.
  const policy = await tx.approvalPolicy.create({
    data: {
      organizationId,
      domain: 'LEAVE',
      code: 'LEAVE_DEFAULT',
      name: 'Leave approval',
      isDefault: true,
      isActive: true,
    },
  });
  await tx.approvalPolicyStep.create({
    data: {
      organizationId,
      approvalPolicyId: policy.id,
      stepNumber: 1,
      approverType: 'ROLE',
      roleId: approverRoleId,
      required: true,
    },
  });
}
