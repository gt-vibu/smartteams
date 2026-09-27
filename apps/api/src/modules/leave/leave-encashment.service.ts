import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { notify } from '../notifications/notify';
import { ledger } from './leave-balance-ops';
import {
  balanceManagers,
  currentBalance,
  has,
  maybeSelf,
  recordChange,
  selfEmployee,
  today,
} from './leave-extras-shared';

/**
 * Leave encashment: an employee exchanges unused days of an encashable type for pay, within the
 * type's yearly limit. Approved, the days leave the balance and the amount — the monthly gross over
 * thirty, per day — is added to the next payroll run as it is calculated.
 */
@Injectable()
export class LeaveEncashmentService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  requestEncashment(context: DomainContext, input: { leaveTypeId: string; days: number }) {
    if (!(input.days > 0) || (input.days * 2) % 1 !== 0)
      throw new ConflictError('Encash whole or half days.');
    return this.database.run(context, async (tx) => {
      const self = await selfEmployee(tx, context);
      const type = await tx.leaveType.findFirst({
        where: { id: input.leaveTypeId, organizationId: context.organizationId, isActive: true },
      });
      if (!type) throw new NotFoundError('Leave type');
      if (!type.encashable) throw new ConflictError(`${type.name} cannot be encashed.`);
      const balance = await currentBalance(tx, context, self.id, type);
      const pending = await tx.leaveEncashment.aggregate({
        where: {
          organizationId: context.organizationId,
          employeeId: self.id,
          leaveTypeId: type.id,
          status: 'PENDING',
        },
        _sum: { days: true },
      });
      const available = balance.availableAmount.sub(pending._sum.days ?? 0);
      if (available.lt(input.days))
        throw new ConflictError(`You have ${available.toString()} days of ${type.name} to encash.`);
      if (type.maxEncashDays) {
        const thisYear = await tx.leaveEncashment.aggregate({
          where: {
            organizationId: context.organizationId,
            employeeId: self.id,
            leaveTypeId: type.id,
            status: { in: ['PENDING', 'APPROVED'] },
            createdAt: { gte: balance.periodStart },
          },
          _sum: { days: true },
        });
        const left = type.maxEncashDays.sub(thisYear._sum.days ?? 0);
        if (left.lt(input.days))
          throw new ConflictError(`You can encash ${left.toString()} more days this year.`);
      }
      const created = await tx.leaveEncashment.create({
        data: {
          organizationId: context.organizationId,
          employeeId: self.id,
          leaveTypeId: type.id,
          days: input.days,
        },
      });
      await notify(tx, context, {
        recipients: await balanceManagers(tx, context.organizationId),
        kind: 'ENCASHMENT_PENDING',
        title: 'Leave encashment request',
        body: `${self.firstName} ${self.lastName} asks to encash ${input.days} days of ${type.name}.`,
        module: 'time-off',
        entityType: 'LEAVE_ENCASHMENT',
        entityId: created.id,
      });
      await recordChange(
        this.audit,
        context,
        tx,
        'LEAVE_ENCASHMENT',
        created.id,
        'ENCASHMENT_REQUESTED',
        null,
        created,
      );
      return { id: created.id, status: created.status };
    });
  }

  listEncashments(context: DomainContext) {
    return this.database.run(context, async (tx) => {
      const self = await maybeSelf(tx, context);
      const rows = await tx.leaveEncashment.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [
            ...(self ? [{ employeeId: self.id }] : []),
            ...(has(context, 'leave.balances.adjust') ? [{ status: 'PENDING' as const }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          employee: { select: { firstName: true, lastName: true } },
          leaveType: { select: { name: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
        leaveType: row.leaveType.name,
        days: Number(row.days),
        amount: row.amount ? Number(row.amount) : null,
        status: row.status,
        decisionComment: row.decisionComment,
        paidInRun: Boolean(row.payrollRunId),
        createdAt: row.createdAt.toISOString(),
        mine: row.employeeId === self?.id,
      }));
    });
  }

  decideEncashment(
    context: DomainContext,
    id: string,
    input: { approve: boolean; comment?: string },
  ) {
    if (!has(context, 'leave.balances.adjust'))
      throw new ForbiddenDomainError('Missing permission: leave.balances.adjust');
    const comment = input.comment?.trim() ?? '';
    if (!input.approve && comment.length < 3) throw new ConflictError('Say why it is declined.');
    return this.database.run(context, async (tx) => {
      const found = await tx.leaveEncashment.findFirst({
        where: { id, organizationId: context.organizationId },
        include: { employee: { select: { userId: true } }, leaveType: true },
      });
      if (!found) throw new NotFoundError('Encashment');
      if (found.employee.userId && found.employee.userId === context.actor.userId)
        throw new ForbiddenDomainError('You cannot decide your own encashment.');
      if (found.status !== 'PENDING') throw new ConflictError('This request has been decided.');
      let amount: Prisma.Decimal | null = null;
      if (input.approve) {
        const balance = await currentBalance(tx, context, found.employeeId, found.leaveType);
        if (balance.availableAmount.lt(found.days))
          throw new ConflictError('The balance no longer covers these days.');
        const pay = await tx.employeeCompensation.findFirst({
          where: {
            organizationId: context.organizationId,
            employeeId: found.employeeId,
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today() } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          select: { grossSalary: true, baseAmount: true },
        });
        if (!pay)
          throw new ConflictError('This employee has no salary set, so nothing can be paid.');
        // A day's pay: the monthly gross over thirty days.
        amount = (pay.grossSalary ?? pay.baseAmount).div(30).mul(found.days).toDecimalPlaces(2);
        await ledger(tx, context, balance.id, {
          transactionType: LeaveBalanceTransactionType.ADJUSTMENT,
          amount: found.days.neg(),
          reason: `Encashed ${found.days.toString()} days`,
        });
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            usedAmount: { increment: found.days },
            availableAmount: { decrement: found.days },
            version: { increment: 1 },
          },
        });
      }
      const updated = await tx.leaveEncashment.update({
        where: { id: found.id },
        data: {
          status: input.approve ? 'APPROVED' : 'REJECTED',
          amount,
          decidedByUserId: context.actor.userId ?? null,
          decidedAt: new Date(),
          decisionComment: comment || null,
        },
      });
      await notify(tx, context, {
        recipients: [found.employee.userId],
        kind: 'ENCASHMENT_DECIDED',
        title: input.approve ? 'Encashment approved' : 'Encashment declined',
        body: input.approve
          ? `${found.days.toString()} days of ${found.leaveType.name} will be paid in your next payroll.`
          : comment,
        module: 'time-off',
        entityType: 'LEAVE_ENCASHMENT',
        entityId: found.id,
      });
      await recordChange(
        this.audit,
        context,
        tx,
        'LEAVE_ENCASHMENT',
        found.id,
        input.approve ? 'ENCASHMENT_APPROVED' : 'ENCASHMENT_REJECTED',
        found,
        updated,
      );
      return { id: found.id, status: updated.status, amount: amount ? Number(amount) : null };
    });
  }
}
