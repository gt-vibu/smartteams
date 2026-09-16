import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { canReadAll, canReadRequestedEmployee } from './payroll-policy.types';

export async function requireEmployee(
  tx: TenantTransaction,
  context: DomainContext,
  employeeId: string,
  write = false,
  readAllPermission = 'payroll.employee-profile.read.all',
) {
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: context.organizationId,
      ...employeeScope(context),
    },
    select: { id: true, userId: true },
  });
  if (!employee) throw new NotFoundError('Employee');
  if (
    !write &&
    !canReadRequestedEmployee(context, readAllPermission) &&
    employee.userId !== context.actor.userId
  )
    throw new ConflictError('Employees may only read their own payroll profile');
  return employee;
}

export async function resolveEmployeeId(
  tx: TenantTransaction,
  context: DomainContext,
  requestedEmployeeId?: string,
  allowAll = false,
  readAllPermission = 'payroll.employee-profile.read.all',
) {
  if (requestedEmployeeId) {
    const employee = await requireEmployee(
      tx,
      context,
      requestedEmployeeId,
      false,
      readAllPermission,
    );
    if (
      !allowAll &&
      !canReadRequestedEmployee(context, readAllPermission) &&
      employee.userId !== context.actor.userId
    )
      throw new ConflictError('Employees may only access their own payroll data');
    return employee.id;
  }
  if (allowAll && canReadAll(context, readAllPermission)) return undefined;
  const employee = await tx.employee.findFirst({
    where: {
      organizationId: context.organizationId,
      userId: context.actor.userId,
      ...employeeScope(context),
    },
    select: { id: true },
  });
  if (!employee) throw new NotFoundError('Employee');
  return employee.id;
}

export function employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
  return context.branchId
    ? {
        OR: [
          { primaryBranchId: context.branchId },
          { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
        ],
      }
    : {};
}

export async function findPolicy(
  tx: TenantTransaction,
  organizationId: string,
  effectiveDate: Date,
) {
  const policy = await tx.payrollPolicy.findFirst({
    where: {
      organizationId,
      effectiveFrom: { lte: effectiveDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  return policy;
}
