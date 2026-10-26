import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { LeaveRequestStatus } from '../../generated/prisma/enums';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { employeeNameSearch } from '../employees/employee-name-search';
import { decisionComments } from './leave-decision-comments';
import {
  canReadAllEmployees,
  decodeLeaveCursor,
  encodeLeaveCursor,
  selfEmployee,
} from './leave-shared';

export type LeaveListFilters = {
  cursor?: string;
  limit?: number;
  status?: LeaveRequestStatus;
  search?: string;
  departmentId?: string;
  from?: string;
  to?: string;
};

export async function listLeaveRequests(
  database: TenantDatabaseService,
  context: DomainContext,
  requestedEmployeeId?: string,
  pagination: LeaveListFilters = {},
) {
  requirePermission(context, 'leave.requests.read');
  return database.run(context, async (tx) => {
    let employeeId = requestedEmployeeId;
    if (!canReadAllEmployees(context, 'leave.requests.read.all')) {
      const self = await selfEmployee(tx, context);
      if (!self) return { requests: [], nextCursor: undefined };
      if (employeeId && employeeId !== self.id)
        throw new ConflictError('Employees may only read their own leave requests');
      employeeId = self.id;
    }
    const cursorId = pagination.cursor ? decodeLeaveCursor(pagination.cursor) : undefined;
    const limit = Math.min(pagination.limit ?? 100, 500);
    const from = pagination.from ? new Date(`${pagination.from.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const to = pagination.to ? new Date(`${pagination.to.slice(0, 10)}T23:59:59.999Z`) : undefined;
    if (from && to && from > to) throw new ConflictError('Choose a start date on or before the end date.');
    const search = employeeNameSearch(pagination.search);
    const requests = await tx.leaveRequest.findMany({
      where: {
        organizationId: context.organizationId,
        employeeId,
        status: pagination.status,
        ...(from || to ? { startDate: { lte: to }, endDate: { gte: from } } : {}),
        ...((search || pagination.departmentId) ? { employee: { ...(search ?? {}), ...(pagination.departmentId ? { departmentId: pagination.departmentId } : {}) } } : {}),
        ...(context.branchId ? { branchId: context.branchId } : {}),
      },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        employee: {
          select: { externalId: true, employeeNumber: true, firstName: true, lastName: true },
        },
      },
    });
    const hasNextPage = requests.length > limit;
    const page = requests.slice(0, limit);
    const comments = await decisionComments(tx, context, page);
    return {
      requests: page.map(({ employee, ...request }) => ({
        ...request,
        externalEmployeeId: employee.externalId,
        ...(context.accessMode === 'NATIVE'
          ? {
              employeeName: `${employee.firstName} ${employee.lastName}`,
              employeeNumber: employee.employeeNumber,
            }
          : {}),
        ...(comments ? { decisionComment: comments.get(request.id) ?? null } : {}),
      })),
      nextCursor: hasNextPage ? encodeLeaveCursor(page.at(-1)?.id) : undefined,
    };
  });
}
