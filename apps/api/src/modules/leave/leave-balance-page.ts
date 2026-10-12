import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { employeeNameSearch } from '../employees/employee-name-search';
import { canReadAllEmployees, employeeScope, selfEmployee } from './leave-shared';
import { ConflictError } from '../../common/errors/domain-error';

export type BalancePageFilters = {
  employeeId?: string; search?: string; cursor?: string; limit?: number;
};

/** Bounded admin history read; provisioning remains in the employee-specific read. */
export async function leaveBalancePage(
  tx: Prisma.TransactionClient, context: DomainContext, filters: BalancePageFilters,
) {
  let employeeId = filters.employeeId;
  if (!canReadAllEmployees(context, 'leave.balances.read.all')) {
    const self = await selfEmployee(tx, context);
    if (!self) return { items: [], nextCursor: undefined };
    if (employeeId && employeeId !== self.id)
      throw new ConflictError('Employees may only read their own leave balances');
    employeeId = self.id;
  }
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const rows = await tx.leaveBalance.findMany({
    where: {
      organizationId: context.organizationId, employeeId,
      employee: { AND: [employeeScope(context), employeeNameSearch(filters.search) ?? {}] },
      leaveType: {
        isActive: true,
        ...(context.branchId ? { policyAssignments: { some: { branchId: context.branchId } } } : {}),
      },
    },
    include: {
      leaveType: true,
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: [{ employeeId: 'asc' }, { periodStart: 'desc' }, { id: 'asc' }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(({ employee, ...balance }) => ({
      ...balance, employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeNumber: employee.employeeNumber,
    })),
    nextCursor: rows.length > limit ? page.at(-1)?.id : undefined,
  };
}
