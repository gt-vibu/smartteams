import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { getEffectiveHolidayDates } from '../holidays/effective-holidays';
import { describeDays, notify } from '../notifications/notify';
import { ledger } from './leave-balance-ops';
import { dayKey } from './leave-shared';
import {
  assertDecider,
  balanceManagers,
  compOffType,
  currentBalance,
  DAY_MS,
  dateOnly,
  has,
  maybeSelf,
  recordChange,
  selfEmployee,
  today,
} from './leave-extras-shared';

/**
 * Comp-off: an employee who worked a weekly off or a holiday asks for the day back. Their manager,
 * or someone who manages leave balances, approves it; the day is credited to the organization's
 * comp-off leave type and lapses if not used within that type's expiry. Oldest credits are used
 * first, so only what is left of an expiring credit lapses.
 */
@Injectable()
export class LeaveCompOffService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  requestCompOff(
    context: DomainContext,
    input: { workDate: string; days: number; reason: string },
  ) {
    const workDate = dateOnly(input.workDate);
    if (Number.isNaN(workDate.getTime())) throw new ConflictError('Choose the day you worked.');
    if (workDate > today()) throw new ConflictError('Comp-off is for a day already worked.');
    if (today().getTime() - workDate.getTime() > 60 * DAY_MS)
      throw new ConflictError('Ask for comp-off within 60 days of the day worked.');
    if (input.days !== 0.5 && input.days !== 1)
      throw new ConflictError('Comp-off is half a day or a full day.');
    const reason = input.reason.trim();
    if (reason.length < 3) throw new ConflictError('Say what the work was.');
    return this.database.run(context, async (tx) => {
      const self = await selfEmployee(tx, context);
      const type = await compOffType(tx, context.organizationId);
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { workWeekDays: true },
      });
      const holidays = await getEffectiveHolidayDates(tx, {
        organizationId: context.organizationId,
        branchId: self.primaryBranchId,
        employeeId: self.id,
        start: workDate,
        end: workDate,
      });
      const offDay =
        !settings.workWeekDays.includes(workDate.getUTCDay() || 7) ||
        holidays.has(dayKey(workDate));
      if (!offDay)
        throw new ConflictError(
          'Comp-off is for working a weekly off or a holiday, not a working day.',
        );
      const attendance = await tx.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId: self.id, workDate } },
        select: { workedMinutes: true },
      });
      if (!attendance || attendance.workedMinutes <= 0)
        throw new ConflictError('There is no attendance recorded for that day.');
      const duplicate = await tx.compOffCredit.findFirst({
        where: { organizationId: context.organizationId, employeeId: self.id, workDate },
        select: { id: true },
      });
      if (duplicate) throw new ConflictError('Comp-off has already been asked for that day.');
      const created = await tx.compOffCredit.create({
        data: {
          organizationId: context.organizationId,
          employeeId: self.id,
          leaveTypeId: type.id,
          workDate,
          days: input.days,
          reason,
        },
      });
      await notify(tx, context, {
        recipients: [self.manager?.userId, ...(await balanceManagers(tx, context.organizationId))],
        kind: 'COMP_OFF_PENDING',
        title: 'Comp-off request',
        body: `${self.firstName} ${self.lastName} worked ${describeDays(workDate, workDate)} and asks for ${input.days === 1 ? 'a day' : 'half a day'} back.`,
        module: 'time-off',
        entityType: 'COMP_OFF',
        entityId: created.id,
      });
      await recordChange(
        this.audit,
        context,
        tx,
        'COMP_OFF',
        created.id,
        'COMP_OFF_REQUESTED',
        null,
        created,
      );
      return compOffDto(created, `${self.firstName} ${self.lastName}`, attendance.workedMinutes);
    });
  }

  /** The caller's own, and — for a manager or leave administrator — those waiting on them. */
  listCompOffs(context: DomainContext) {
    return this.database.run(context, async (tx) => {
      const self = await maybeSelf(tx, context);
      const rows = await tx.compOffCredit.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [
            ...(self ? [{ employeeId: self.id }] : []),
            ...(has(context, 'leave.balances.adjust')
              ? [{ status: 'PENDING' as const }]
              : self
                ? [{ status: 'PENDING' as const, employee: { managerEmployeeId: self.id } }]
                : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      const worked = await tx.attendanceRecord.findMany({
        where: {
          organizationId: context.organizationId,
          OR: rows.map((row) => ({ employeeId: row.employeeId, workDate: row.workDate })),
        },
        select: { employeeId: true, workDate: true, workedMinutes: true },
      });
      const minutes = new Map(
        worked.map((row) => [`${row.employeeId}:${dayKey(row.workDate)}`, row.workedMinutes]),
      );
      return rows.map((row) => ({
        ...compOffDto(
          row,
          `${row.employee.firstName} ${row.employee.lastName}`,
          minutes.get(`${row.employeeId}:${dayKey(row.workDate)}`) ?? 0,
        ),
        mine: row.employeeId === self?.id,
      }));
    });
  }

  decideCompOff(context: DomainContext, id: string, input: { approve: boolean; comment?: string }) {
    const comment = input.comment?.trim() ?? '';
    return this.database.run(context, async (tx) => {
      const found = await tx.compOffCredit.findFirst({
        where: { id, organizationId: context.organizationId },
        include: {
          employee: { select: { userId: true, manager: { select: { userId: true } } } },
          leaveType: true,
        },
      });
      if (!found) throw new NotFoundError('Comp-off request');
      assertDecider(context, found.employee);
      if (found.status !== 'PENDING') throw new ConflictError('This request has been decided.');
      const expiresOn =
        input.approve && found.leaveType.compOffExpiryDays
          ? new Date(today().getTime() + found.leaveType.compOffExpiryDays * DAY_MS)
          : null;
      const updated = await tx.compOffCredit.update({
        where: { id: found.id },
        data: {
          status: input.approve ? 'APPROVED' : 'REJECTED',
          decidedByUserId: context.actor.userId ?? null,
          decidedAt: new Date(),
          decisionComment: comment || null,
          expiresOn,
        },
      });
      if (input.approve) {
        const balance = await currentBalance(tx, context, found.employeeId, found.leaveType);
        await ledger(tx, context, balance.id, {
          transactionType: LeaveBalanceTransactionType.ADJUSTMENT,
          amount: found.days,
          reason: `Comp-off for working ${dayKey(found.workDate)}`,
        });
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            accruedAmount: { increment: found.days },
            availableAmount: { increment: found.days },
            version: { increment: 1 },
          },
        });
      }
      await notify(tx, context, {
        recipients: [found.employee.userId],
        kind: 'COMP_OFF_DECIDED',
        title: input.approve ? 'Comp-off approved' : 'Comp-off declined',
        body: input.approve
          ? `${Number(found.days) === 1 ? 'A day' : 'Half a day'} was added to your ${found.leaveType.name}${expiresOn ? `, to use by ${describeDays(expiresOn, expiresOn)}` : ''}.`
          : comment,
        module: 'time-off',
        entityType: 'COMP_OFF',
        entityId: found.id,
      });
      await recordChange(
        this.audit,
        context,
        tx,
        'COMP_OFF',
        found.id,
        input.approve ? 'COMP_OFF_APPROVED' : 'COMP_OFF_REJECTED',
        found,
        updated,
      );
      return { id: found.id, status: updated.status };
    });
  }

  /** Lapses unused comp-off past its expiry. Oldest credits are used first. Idempotent. */
  lapseCompOffs(context: DomainContext) {
    return this.database.run(context, async (tx) => {
      const due = await tx.compOffCredit.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'APPROVED',
          lapsedDays: null,
          expiresOn: { lt: today() },
        },
        orderBy: { expiresOn: 'asc' },
        include: { leaveType: true },
      });
      let lapsed = 0;
      for (const credit of due) {
        const balance = await currentBalance(tx, context, credit.employeeId, credit.leaveType);
        const stillValid = await tx.compOffCredit.aggregate({
          where: {
            organizationId: context.organizationId,
            employeeId: credit.employeeId,
            status: 'APPROVED',
            id: { not: credit.id },
            OR: [{ expiresOn: null }, { expiresOn: { gte: today() } }],
          },
          _sum: { days: true },
        });
        const fresh = stillValid._sum.days ?? new Prisma.Decimal(0);
        const unused = Prisma.Decimal.max(
          0,
          Prisma.Decimal.min(credit.days, balance.availableAmount.sub(fresh)),
        );
        if (unused.gt(0)) {
          await ledger(tx, context, balance.id, {
            transactionType: LeaveBalanceTransactionType.EXPIRY,
            amount: unused.neg(),
            reason: `Unused comp-off for ${dayKey(credit.workDate)} lapsed`,
          });
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { availableAmount: { decrement: unused }, version: { increment: 1 } },
          });
        }
        await tx.compOffCredit.update({ where: { id: credit.id }, data: { lapsedDays: unused } });
        lapsed += Number(unused);
      }
      return lapsed;
    });
  }
}

function compOffDto(
  row: {
    id: string;
    employeeId: string;
    workDate: Date;
    days: Prisma.Decimal;
    reason: string;
    status: string;
    decisionComment: string | null;
    expiresOn: Date | null;
    lapsedDays: Prisma.Decimal | null;
    createdAt: Date;
  },
  employeeName: string,
  workedMinutes: number,
) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName,
    workDate: dayKey(row.workDate),
    days: Number(row.days),
    workedMinutes,
    reason: row.reason,
    status: row.status,
    decisionComment: row.decisionComment,
    expiresOn: row.expiresOn ? dayKey(row.expiresOn) : null,
    lapsedDays: row.lapsedDays ? Number(row.lapsedDays) : null,
    createdAt: row.createdAt.toISOString(),
  };
}
