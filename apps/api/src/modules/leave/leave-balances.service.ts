import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { canReadAllEmployees, dateOnly, employeeScope, selfEmployee } from './leave-shared';
import { ledger, provisionAssignedBalances } from './leave-balance-ops';

/**
 * Reading and correcting leave balances.
 *
 * Self-scoped the same way every other employee-owned read is: your own balances unless you hold
 * the organization-wide permission. Adjustments always write a ledger row, so a balance can be
 * explained after the fact rather than only observed.
 */
@Injectable()
export class LeaveBalancesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listBalances(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'leave.balances.read');
    return this.database.run(context, async (tx) => {
      let employeeId = requestedEmployeeId;
      if (!canReadAllEmployees(context, 'leave.balances.read.all')) {
        const self = await selfEmployee(tx, context);
        if (!self) return [];
        if (employeeId && employeeId !== self.id)
          throw new ConflictError('Employees may only read their own leave balances');
        employeeId = self.id;
      }
      if (employeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            id: employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...(context.branchId
              ? {
                  OR: [
                    { primaryBranchId: context.branchId },
                    { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            primaryBranchId: true,
            branchAssignments: { where: { endsOn: null }, select: { branchId: true } },
          },
        });
        if (!employee) throw new NotFoundError('Active employee');
        const branchIds = context.branchId
          ? [context.branchId]
          : Array.from(
              new Set(
                [
                  employee.primaryBranchId,
                  ...employee.branchAssignments.map((assignment) => assignment.branchId),
                ].filter((value): value is string => Boolean(value)),
              ),
            );
        const settings = await tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        });
        for (const branchId of branchIds)
          await provisionAssignedBalances(
            tx,
            context.organizationId,
            employee.id,
            branchId,
            settings.leaveYearStartMonth,
          );
      }
      return tx.leaveBalance.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
          ...(context.branchId
            ? { leaveType: { policyAssignments: { some: { branchId: context.branchId } } } }
            : {}),
        },
        include: { leaveType: true },
        orderBy: [{ employeeId: 'asc' }, { periodStart: 'desc' }],
      });
    });
  }

  async adjustBalance(
    context: DomainContext,
    input: {
      employeeId: string;
      leaveTypeId: string;
      amount: number;
      reason: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    requirePermission(context, 'leave.balances.adjust');
    requireReason(
      { ...context, reason: input.reason },
      'Leave balance adjustment requires a reason',
    );
    return this.database.run(context, async (tx) => {
      const balance = await tx.leaveBalance.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: dateOnly(input.periodStart),
          periodEnd: dateOnly(input.periodEnd),
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
      });
      if (!balance) throw new NotFoundError('Leave balance');
      const updated = await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { availableAmount: { increment: input.amount }, version: { increment: 1 } },
      });
      await ledger(tx, context, balance.id, {
        transactionType: LeaveBalanceTransactionType.ADJUSTMENT,
        amount: new Prisma.Decimal(input.amount),
        reason: input.reason,
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_BALANCE',
          entityId: balance.id,
          action: 'LEAVE_BALANCE_ADJUSTED',
          beforeState: jsonSnapshot(balance),
          afterState: jsonSnapshot(updated),
          reason: input.reason,
        },
        tx,
      );
      return updated;
    });
  }
}
