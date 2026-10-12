import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { WorkforceFilterDto, WorkforcePreviewDto } from './workforce.dto';

export function authorizeWorkforce(
  context: DomainContext,
  operation: WorkforcePreviewDto['operation'],
) {
  requirePermission(context, 'employees.read.all');
  requirePermission(
    context,
    {
      SALARY: 'payroll.employee-profile.write',
      PAYROLL_POLICY: 'payroll.employee-profile.write',
      SHIFT: 'shifts.write',
      MANAGER: 'employees.write',
      LEAVE_POLICY: 'leave.types.write',
    }[operation],
  );
  if (context.accessMode !== 'NATIVE')
    throw new ConflictError('Workforce jobs require a native administrator.');
}
export function workforceFilter(
  context: DomainContext,
  filter: WorkforceFilterDto,
): Prisma.EmployeeWhereInput {
  if (
    filter.branchIds?.length &&
    context.branchId &&
    filter.branchIds.some((id) => id !== context.branchId)
  )
    throw new ConflictError('Select branches within your administrative scope.');
  if (filter.branchIds && !filter.branchIds.length)
    throw new ConflictError('Select at least one branch.');
  if (context.branchId && filter.branchId && context.branchId !== filter.branchId)
    throw new ConflictError('Select a branch within your administrative scope.');
  if (
    !filter.allEmployees &&
    !filter.branchIds?.length &&
    !filter.branchId &&
    !filter.departmentId &&
    !filter.roleId &&
    !filter.teamId &&
    !filter.employmentType &&
    !filter.search?.trim() &&
    !filter.employeeIds?.length
  )
    throw new ConflictError('Select people, a group, or explicitly choose all active employees.');
  if (filter.employeeIds && !filter.employeeIds.length)
    throw new ConflictError('Select at least one employee.');
  const search = filter.search?.trim();
  return {
    organizationId: context.organizationId,
    status: 'ACTIVE',
    ...(filter.employmentType ? { employmentType: filter.employmentType === 'CONTRACT' ? 'CONTRACTOR' : filter.employmentType } : {}),
    ...(filter.teamId ? { teamMemberships: { some: { teamId: filter.teamId, organizationId: context.organizationId, leftAt: null } } } : {}),
    ...(context.branchId || filter.branchId
      ? { primaryBranchId: context.branchId ?? filter.branchId }
      : {}),
    ...(filter.branchIds ? { AND: [{ primaryBranchId: { in: filter.branchIds } }] } : {}),
    ...(filter.employeeIds ? { id: { in: filter.employeeIds } } : {}),
    ...(filter.excludeEmployeeIds?.length ? { id: { notIn: filter.excludeEmployeeIds } } : {}),
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.roleId
      ? {
          user: {
            is: {
              isActive: true,
              memberships: { some: { organizationId: context.organizationId, status: 'ACTIVE' } },
              organizationRoleAssignments: {
                some: {
                  organizationId: context.organizationId,
                  roleId: filter.roleId,
                  startsAt: { lte: new Date() },
                  OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
                },
              },
            },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { employeeNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}
