import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { approvalLocalDate } from '../approvals/approval-automation';
import type { WorkforcePreviewDto, WorkforceFilterDto } from './workforce.dto';
import { authorizeWorkforce, workforceFilter } from './workforce-selection';

@Injectable()
export class WorkforceCatalogService {
  constructor(private readonly database: TenantDatabaseService) {}
  options(context: DomainContext, operation: WorkforcePreviewDto['operation']) {
    authorizeWorkforce(context, operation);
    return this.database.run(context, async (tx) => {
      const scoped = { organizationId: context.organizationId };
      const [branches, departments, roles] = await Promise.all([
        tx.branch.findMany({
          where: {
            ...scoped,
            status: 'ACTIVE',
            ...(context.branchId ? { id: context.branchId } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        tx.department.findMany({
          where: scoped,
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        tx.role.findMany({
          where: {
            OR: [
              { organizationId: context.organizationId },
              { organizationId: null, scope: 'ORGANIZATION' },
            ],
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);
      const targets =
        operation === 'PAYROLL_POLICY'
          ? await tx.payrollPolicy.findMany({
              where: scoped,
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : operation === 'SHIFT'
            ? await tx.shift.findMany({
                where: { ...scoped, isActive: true },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : operation === 'LEAVE_POLICY'
              ? await tx.leaveType.findMany({
                  where: { ...scoped, isActive: true },
                  select: { id: true, name: true },
                  orderBy: { name: 'asc' },
                })
              : [];
      return {
        branches,
        departments,
        roles,
        targets,
        today: await approvalLocalDate(tx, context.organizationId),
      };
    });
  }
  people(context: DomainContext, filter: WorkforceFilterDto, cursor?: string) {
    requirePermission(context, 'employees.read.all');
    return this.database.run(context, async (tx) => {
      const where = workforceFilter(context, { ...filter, allEmployees: true });
      const [total, items] = await Promise.all([
        tx.employee.count({ where }),
        tx.employee.findMany({
          where,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
          take: 51,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            primaryBranch: { select: { name: true } },
          },
        }),
      ]);
      return {
        total,
        items: items.slice(0, 50).map((item) => ({
          id: item.id,
          name: `${item.firstName} ${item.lastName}`,
          employeeNumber: item.employeeNumber,
          branchName: item.primaryBranch?.name ?? null,
        })),
        nextCursor: items.length > 50 ? items[49]!.id : null,
      };
    });
  }
}
