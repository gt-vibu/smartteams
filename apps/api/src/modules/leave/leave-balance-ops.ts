import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import type { LeaveAccrualType } from '../../generated/prisma/enums';
import { getEffectiveHolidayDates } from '../holidays/effective-holidays';
import { dayKey, initialEntitlement, leavePeriod } from './leave-shared';

/**
 * Balance movements: opening a balance, releasing a reservation, writing the ledger, and counting
 * working days.
 *
 * Kept apart from the services because all four are used from more than one of them — creating a
 * request, deciding one, cancelling one and adjusting a balance all move the same numbers. Left
 * on one service and called from the others, they would have forced exactly the tangle that the
 * original single file was.
 *
 * Every one takes its transaction, so the caller keeps control of the boundary.
 */

export async function provisionAssignedBalances(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
  branchId: string,
  leaveYearStartMonth: number,
) {
  const assignments = await tx.leavePolicyAssignment.findMany({
    where: { organizationId, branchId },
    include: { leaveType: true },
  });
  for (const assignment of assignments)
    await provisionBalance(
      tx,
      organizationId,
      employeeId,
      assignment.leaveType,
      leaveYearStartMonth,
      new Date(),
    );
}

/**
 * Opens a leave balance for every employee a policy has just been assigned to.
 *
 * The single-employee `provisionBalance` below is right when one person joins or one balance is
 * repaired. Assigning a policy to a branch is not that: it was calling it in a loop, so a
 * branch of five thousand people meant ten thousand sequential round trips — a read and a write
 * each — inside one write transaction. Three statements do the same work regardless of size.
 *
 * The entitlement is identical for everyone here: `initialEntitlement` depends only on the
 * leave type, the period and today's date, none of which vary across the employees in one
 * assignment. That is what makes a single `createMany` correct rather than a shortcut.
 *
 * `skipDuplicates` alongside the explicit existence check is not redundant: the check keeps the
 * returned count honest, and the flag keeps a concurrent assignment from turning into a unique
 * violation. Employees who already hold a balance for the period are left exactly as they are,
 * which is what the per-employee version did by returning early.
 */

export async function provisionBalancesForAll(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeIds: string[],
  type: {
    id: string;
    accrualType: LeaveAccrualType;
    annualAllowance: Prisma.Decimal | null;
    monthlyAccrual: Prisma.Decimal | null;
  },
  leaveYearStartMonth: number,
  date: Date,
) {
  if (employeeIds.length === 0) return 0;
  const { periodStart, periodEnd } = leavePeriod(date, leaveYearStartMonth);
  const existing = await tx.leaveBalance.findMany({
    where: {
      organizationId,
      leaveTypeId: type.id,
      periodStart,
      periodEnd,
      employeeId: { in: employeeIds },
    },
    select: { employeeId: true },
  });
  const alreadyHeld = new Set(existing.map((balance) => balance.employeeId));
  const missing = employeeIds.filter((employeeId) => !alreadyHeld.has(employeeId));
  if (missing.length === 0) return 0;
  const amount = initialEntitlement(type, periodStart, date);
  await tx.leaveBalance.createMany({
    data: missing.map((employeeId) => ({
      organizationId,
      employeeId,
      leaveTypeId: type.id,
      periodStart,
      periodEnd,
      openingAmount: 0,
      accruedAmount: amount,
      usedAmount: 0,
      reservedAmount: 0,
      availableAmount: amount,
    })),
    skipDuplicates: true,
  });
  return missing.length;
}

export async function provisionBalance(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
  type: {
    id: string;
    accrualType: LeaveAccrualType;
    annualAllowance: Prisma.Decimal | null;
    monthlyAccrual: Prisma.Decimal | null;
  },
  leaveYearStartMonth: number,
  date: Date,
) {
  const { periodStart, periodEnd } = leavePeriod(date, leaveYearStartMonth);
  const existing = await tx.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_periodStart_periodEnd: {
        employeeId,
        leaveTypeId: type.id,
        periodStart,
        periodEnd,
      },
    },
  });
  if (existing) return false;
  const amount = initialEntitlement(type, periodStart, date);
  await tx.leaveBalance.upsert({
    where: {
      employeeId_leaveTypeId_periodStart_periodEnd: {
        employeeId,
        leaveTypeId: type.id,
        periodStart,
        periodEnd,
      },
    },
    create: {
      organizationId,
      employeeId,
      leaveTypeId: type.id,
      periodStart,
      periodEnd,
      openingAmount: 0,
      accruedAmount: amount,
      usedAmount: 0,
      reservedAmount: 0,
      availableAmount: amount,
    },
    update: {},
  });
  return true;
}

export async function releaseReservation(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  balanceId: string,
  requestId: string,
  days: number,
  reason: string,
) {
  await ledger(tx, context, balanceId, {
    transactionType: LeaveBalanceTransactionType.RELEASE,
    amount: new Prisma.Decimal(days),
    reason,
    leaveRequestId: requestId,
  });
  await tx.leaveBalance.update({
    where: { id: balanceId },
    data: {
      reservedAmount: { decrement: days },
      availableAmount: { increment: days },
      version: { increment: 1 },
    },
  });
}

export async function ledger(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  balanceId: string,
  input: {
    transactionType: LeaveBalanceTransactionType;
    amount: Prisma.Decimal;
    reason: string;
    leaveRequestId?: string;
  },
) {
  await tx.leaveBalanceTransaction.create({
    data: {
      organizationId: context.organizationId,
      leaveBalanceId: balanceId,
      leaveRequestId: input.leaveRequestId,
      transactionType: input.transactionType,
      amount: input.amount,
      reason: input.reason,
      createdByUserId: context.actor.userId,
      createdByClientId: context.actor.clientId,
    },
  });
}

export async function workingDays(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string | null,
  start: Date,
  end: Date,
  weekDays: number[],
  employeeId?: string | null,
) {
  const excluded = await getEffectiveHolidayDates(tx, {
    organizationId,
    branchId,
    employeeId,
    start,
    end,
  });

  let total = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1))
    if (weekDays.includes(cursor.getUTCDay() || 7) && !excluded.has(dayKey(cursor))) total += 1;
  return total;
}
