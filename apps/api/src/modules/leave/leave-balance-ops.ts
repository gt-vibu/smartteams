import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { getEffectiveHolidayDates } from '../holidays/effective-holidays';
import { dayKey, leavePeriod } from './leave-shared';
import { entitlement, reconcileBalance, type AccrualLeaveType } from './leave-accrual';

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
  context: DomainContext,
  employeeId: string,
  branchId: string,
  leaveYearStartMonth: number,
) {
  const assignments = await tx.leavePolicyAssignment.findMany({
    where: {
      organizationId: context.organizationId,
      branchId,
      // A deactivated type cannot be requested, so it opens no new balance (federation unchanged).
      ...(context.accessMode === 'NATIVE' ? { leaveType: { isActive: true } } : {}),
    },
    include: { leaveType: true },
  });
  for (const assignment of assignments)
    await provisionBalance(
      tx,
      context,
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
 * repaired. Assigning a policy to a branch is not that: a branch of five thousand people must not
 * mean thousands of sequential round trips inside one write transaction, so the balances and
 * their first ledger entries are written in bulk. The entitlement differs only by joining date,
 * so it is worked out per person in memory. A newly assigned type has no last year to carry from;
 * the daily accrual job records the opening and keeps monthly types growing from here.
 */
export async function provisionBalancesForAll(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  employeeIds: string[],
  type: { id: string } & AccrualLeaveType,
  leaveYearStartMonth: number,
  date: Date,
) {
  if (employeeIds.length === 0) return 0;
  const organizationId = context.organizationId;
  const period = leavePeriod(date, leaveYearStartMonth);
  const existing = await tx.leaveBalance.findMany({
    where: { organizationId, leaveTypeId: type.id, ...period, employeeId: { in: employeeIds } },
    select: { employeeId: true },
  });
  const alreadyHeld = new Set(existing.map((balance) => balance.employeeId));
  const missing = await tx.employee.findMany({
    where: {
      organizationId,
      id: { in: employeeIds.filter((employeeId) => !alreadyHeld.has(employeeId)) },
    },
    select: { id: true, dateOfJoining: true },
  });
  if (missing.length === 0) return 0;
  const today = new Date();
  const amounts = new Map(
    missing.map((employee) => [
      employee.id,
      entitlement(type, period, employee.dateOfJoining, today),
    ]),
  );
  await tx.leaveBalance.createMany({
    data: missing.map((employee) => ({
      organizationId,
      employeeId: employee.id,
      leaveTypeId: type.id,
      ...period,
      openingAmount: 0,
      accruedAmount: amounts.get(employee.id)!,
      usedAmount: 0,
      reservedAmount: 0,
      availableAmount: amounts.get(employee.id)!,
    })),
    skipDuplicates: true,
  });
  const created = await tx.leaveBalance.findMany({
    where: {
      organizationId,
      leaveTypeId: type.id,
      ...period,
      employeeId: { in: [...amounts.keys()] },
    },
    select: { id: true, employeeId: true, accruedAmount: true },
  });
  await tx.leaveBalanceTransaction.createMany({
    data: created
      .filter((balance) => balance.accruedAmount.gt(0))
      .map((balance) => ({
        organizationId,
        leaveBalanceId: balance.id,
        transactionType: LeaveBalanceTransactionType.ACCRUAL,
        amount: balance.accruedAmount,
        reason: type.accrualType === 'MONTHLY' ? 'Monthly accrual' : 'Annual allowance',
        createdByUserId: context.actor.userId,
        createdByClientId: context.actor.clientId,
      })),
  });
  return missing.length;
}

/** Opens one balance if it is not there yet, and brings it up to what is due. */
export async function provisionBalance(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  employeeId: string,
  type: { id: string } & AccrualLeaveType,
  leaveYearStartMonth: number,
  date: Date,
) {
  const period = leavePeriod(date, leaveYearStartMonth);
  const key = { employeeId, leaveTypeId: type.id, ...period };
  const existing = await tx.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_periodStart_periodEnd: key },
  });
  if (existing) return false;
  const balance = await tx.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_periodStart_periodEnd: key },
    create: {
      organizationId: context.organizationId,
      ...key,
      openingAmount: 0,
      accruedAmount: 0,
      usedAmount: 0,
      reservedAmount: 0,
      availableAmount: 0,
    },
    update: {},
  });
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId: context.organizationId },
    select: { dateOfJoining: true },
  });
  await reconcileBalance(tx, context, balance, type, employee?.dateOfJoining ?? null);
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
  /** Count the off-days between the first and last leave day too. */
  sandwich = false,
) {
  const excluded = await getEffectiveHolidayDates(tx, {
    organizationId,
    branchId,
    employeeId,
    start,
    end,
  });

  const working: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1))
    if (weekDays.includes(cursor.getUTCDay() || 7) && !excluded.has(dayKey(cursor)))
      working.push(new Date(cursor));
  if (!sandwich || working.length < 2) return working.length;
  // The sandwich rule: weekends and holidays enclosed by leave days are leave too. Off-days at
  // either end of the range are not enclosed, so they still do not count.
  const first = working[0]!;
  const last = working[working.length - 1]!;
  return Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
}
