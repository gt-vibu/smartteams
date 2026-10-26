import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { approvalLocalDate } from '../approvals/approval-automation';
import type { WorkforcePreviewDto } from './workforce.dto';
import { authorizeWorkforce, workforceFilter } from './workforce-selection';

export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type WorkforceRow = {
  id: string;
  name: string;
  revision: string;
  error: string | null;
  affected: number;
};

@Injectable()
export class WorkforcePlanService {
  constructor(private readonly database: TenantDatabaseService) {}

  async target(tx: Prisma.TransactionClient, context: DomainContext, input: WorkforcePreviewDto) {
    const where = { organizationId: context.organizationId, id: input.targetId };
    if (input.operation === 'SALARY') {
      if (!input.salary || !Number.isFinite(input.salary.grossSalary) || input.salary.grossSalary <= 0 || input.salary.grossSalary > 100000000)
        throw new ConflictError('Enter a valid monthly gross salary.');
      return { name: `Monthly salary ${input.salary.grossSalary}`, revision: digest(input.salary), branchId: null };
    }
    if (input.operation === 'PAYROLL_POLICY') {
      const row = await tx.payrollPolicy.findFirst({ where });
      const date = new Date(`${input.effectiveFrom.slice(0, 10)}T00:00:00Z`);
      if (!row || row.effectiveFrom > date || (row.effectiveTo && row.effectiveTo < date))
        throw new ConflictError('Choose a payroll policy effective on the assignment date.');
      return { name: row.name, revision: digest(row), branchId: null };
    }
    if (input.operation === 'SHIFT') {
      const row = await tx.shift.findFirst({ where: { ...where, isActive: true } });
      if (!row) throw new NotFoundError('Active shift');
      return { name: row.name, revision: digest(row), branchId: row.branchId };
    }
    if (input.operation === 'LEAVE_POLICY') {
      const row = await tx.leaveType.findFirst({ where: { ...where, isActive: true } });
      if (!row) throw new NotFoundError('Active leave type');
      return { name: row.name, revision: digest(row), branchId: null };
    }
    const row = await tx.employee.findFirst({ where: { ...where, status: 'ACTIVE' } });
    if (!row) throw new NotFoundError('Active manager');
    return {
      name: `${row.firstName} ${row.lastName}`,
      revision: digest({ id: row.id, version: row.version }),
      branchId: null,
    };
  }

  async plan(context: DomainContext, input: WorkforcePreviewDto) {
    authorizeWorkforce(context, input.operation);
    const employeeWhere = workforceFilter(context, input.filter);
    const from = new Date(`${input.effectiveFrom.slice(0, 10)}T00:00:00Z`);
    if (input.effectiveFrom !== input.effectiveFrom.slice(0, 10) || Number.isNaN(from.getTime()))
      throw new ConflictError('Use a calendar date for the effective date.');
    return this.database.run(
      context,
      async (tx) => {
        if (
          input.operation === 'MANAGER' &&
          input.effectiveFrom !== (await approvalLocalDate(tx, context.organizationId))
        )
          throw new ConflictError('Reporting manager changes take effect today.');
        const target = await this.target(tx, context, input);
        let rows: WorkforceRow[];
        if (input.operation === 'LEAVE_POLICY') {
          if (
            input.filter.roleId ||
            input.filter.departmentId ||
            input.filter.employeeIds ||
            input.filter.search?.trim()
          )
            throw new ConflictError(
              'Leave availability is assigned by branch. Select a branch or all branches.',
            );
          if (input.effectiveFrom !== (await approvalLocalDate(tx, context.organizationId)))
            throw new ConflictError('Branch leave availability takes effect today.');
          const branches = await tx.branch.findMany({
            where: {
              organizationId: context.organizationId,
              status: 'ACTIVE',
              ...(input.filter.branchIds ? { AND: [{ id: { in: input.filter.branchIds } }] } : {}),
              ...(context.branchId || input.filter.branchId
                ? { id: context.branchId ?? input.filter.branchId }
                : {}),
            },
            orderBy: { id: 'asc' },
            take: 1001,
            select: { id: true, name: true, updatedAt: true },
          });
          if (branches.length > 1000) throw new ConflictError('Select fewer than 1,001 branches.');
          const counts = await tx.employee.groupBy({
            by: ['primaryBranchId'],
            where: { organizationId: context.organizationId, status: 'ACTIVE' },
            _count: { _all: true },
          });
          rows = branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            revision: digest(branch),
            error: null,
            affected: counts.find((count) => count.primaryBranchId === branch.id)?._count._all ?? 0,
          }));
        } else {
          const people = await tx.employee.findMany({
            where: employeeWhere,
            orderBy: { id: 'asc' },
            take: 10001,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              primaryBranchId: true,
              version: true,
              shifts: {
                orderBy: { id: 'asc' },
                where: { OR: [{ endsOn: null }, { endsOn: { gte: from } }] },
                select: { id: true, shiftId: true, startsOn: true, endsOn: true },
              },
              ...(input.operation === 'SALARY' ? { compensations: { orderBy: { effectiveFrom: 'asc' as const }, where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] } } } : {}),
              payrollPolicies: {
                where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
                orderBy: { effectiveFrom: 'asc' },
              },
            },
          });
          if (people.length > 10000)
            throw new ConflictError('This selection exceeds 10,000 employees. Narrow the group.');
          rows = people.map((person) => ({
            id: person.id,
            name: `${person.firstName} ${person.lastName} · ${person.employeeNumber}`,
            revision: digest({
              version: person.version,
              shifts: person.shifts,
              payroll: person.payrollPolicies,
              ...(input.operation === 'SALARY' ? { compensations: person.compensations } : {}),
            }),
            affected: 1,
            error:
              input.operation === 'MANAGER' && person.id === input.targetId
                ? 'A manager cannot report to themselves.'
                : input.operation === 'PAYROLL_POLICY' &&
                    person.payrollPolicies.some(
                      (item) =>
                        item.effectiveFrom <= from &&
                        (!item.effectiveTo || item.effectiveTo >= from) &&
                        !item.payrollEnabled,
                    )
                  ? 'Payroll is disabled individually. Enable it in the employee payroll profile first.'
                  : input.operation === 'SHIFT' &&
                      target.branchId &&
                      person.primaryBranchId !== target.branchId
                    ? 'Shift is for another branch.'
                    : null,
          }));
        }
        if (!rows.length)
          throw new ConflictError('No active people or branches match this selection.');
        const end = new Date(from.getTime() + 29 * 86400000);
        const ids = rows.map((row) => row.id);
        const impact =
          input.operation === 'SHIFT'
            ? {
                from: input.effectiveFrom,
                to: end.toISOString().slice(0, 10),
                leaveRequests: await tx.leaveRequest.count({
                  where: {
                    organizationId: context.organizationId,
                    employeeId: { in: ids },
                    status: { in: ['PENDING', 'APPROVED'] },
                    startDate: { lte: end },
                    endDate: { gte: from },
                  },
                }),
                attendanceRecords: await tx.attendanceRecord.count({
                  where: {
                    organizationId: context.organizationId,
                    employeeId: { in: ids },
                    workDate: { gte: from, lte: end },
                  },
                }),
              }
            : null;
        const closedPayroll = ['SHIFT', 'PAYROLL_POLICY', 'SALARY'].includes(input.operation)
          ? await tx.payrollRun.count({
              where: {
                organizationId: context.organizationId,
                periodEnd: { gte: from },
                status: { in: ['RELEASED', 'LOCKED'] },
              },
            })
          : 0;
        if (closedPayroll)
          rows = rows.map((row) => ({
            ...row,
            error:
              row.error ??
              'Released payroll covers the effective period. Open an authorized correction run first.',
          }));
        const values = {
          operation: input.operation,
          targetId: input.targetId,
          effectiveFrom: input.effectiveFrom,
          reason: input.reason,
          filter: input.filter,
          ...(input.salary ? { salary: input.salary } : {}),
        };
        return {
          rows,
          targetRevision: target.revision,
          targetName: target.name,
          impact,
          total: rows.length,
          affectedEmployees: rows.reduce((sum, row) => sum + row.affected, 0),
          valid: rows.filter((row) => !row.error).length,
          invalid: rows.filter((row) => row.error).length,
          fingerprint: digest({ input: values, target, rows }),
        };
      },
      { timeout: 60000 },
    );
  }
}
