import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType, type LeaveAccrualType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * What a balance should hold, and bringing it there.
 *
 * A balance used to be filled once, when it was opened: a monthly type kept the months counted on
 * that day for the rest of the year, a fixed allowance went in full to someone joining in the last
 * month, and a carry-forward limit was stored and never used. Here the entitlement is a function of
 * the type, the leave year, the person's joining date and today — and `reconcileBalance` moves a
 * balance up to it, writing each movement to the ledger. It runs when a balance is opened and
 * every day from the accrual job, and is idempotent: running it twice changes nothing.
 *
 * Entitlement only ever grows a balance. A policy made less generous later does not claw back
 * days already granted; an administrator adjusts a balance for that, with a reason.
 */

export type AccrualLeaveType = {
  accrualType: LeaveAccrualType;
  annualAllowance: Prisma.Decimal | null;
  monthlyAccrual: Prisma.Decimal | null;
  carryoverLimit: Prisma.Decimal | null;
  prorateForJoiners: boolean;
};

const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

/** Months from `from` to `to`, both counted, never negative. */
const monthsBetween = (from: Date, to: Date) => Math.max(0, monthIndex(to) - monthIndex(from) + 1);

/** Rounded down to the half day, the smallest unit leave is taken in. */
const toHalfDays = (value: Prisma.Decimal) => value.mul(2).floor().div(2);

export function entitlement(
  type: AccrualLeaveType,
  period: { periodStart: Date; periodEnd: Date },
  joinedOn: Date | null,
  today: Date,
): Prisma.Decimal {
  // Joining counts from the month someone joins; before the year started, from its first month.
  const joinedDuring = joinedOn !== null && joinedOn > period.periodStart;
  const from = joinedDuring ? joinedOn : period.periodStart;
  if (joinedOn !== null && joinedOn > period.periodEnd) return new Prisma.Decimal(0);

  if (type.accrualType === 'FIXED_ANNUAL') {
    const allowance = type.annualAllowance ?? new Prisma.Decimal(0);
    if (!joinedDuring || !type.prorateForJoiners) return allowance;
    return toHalfDays(allowance.mul(monthsBetween(from, period.periodEnd)).div(12));
  }
  if (type.accrualType === 'MONTHLY') {
    // Earned month by month: nothing yet for months still to come.
    const upTo = today < period.periodEnd ? today : period.periodEnd;
    if (upTo < from) return new Prisma.Decimal(0);
    return (type.monthlyAccrual ?? new Prisma.Decimal(0)).mul(monthsBetween(from, upTo));
  }
  return new Prisma.Decimal(0);
}

/**
 * Brings one balance up to date: the carry-forward from last year, once last year is over, then
 * whatever has accrued since. Returns the days added.
 */
export async function reconcileBalance(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  balance: {
    id: string;
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    periodEnd: Date;
    accruedAmount: Prisma.Decimal;
  },
  type: AccrualLeaveType,
  joinedOn: Date | null,
  today = new Date(),
) {
  let added = new Prisma.Decimal(0);
  if (balance.periodStart <= today)
    added = added.add(await carryForward(tx, context, balance, type));

  const target = entitlement(type, balance, joinedOn, today);
  const due = target.sub(balance.accruedAmount);
  if (due.gt(0)) {
    await tx.leaveBalanceTransaction.create({
      data: movement(
        context,
        balance.id,
        LeaveBalanceTransactionType.ACCRUAL,
        due,
        accrualReason(type),
      ),
    });
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        accruedAmount: { increment: due },
        availableAmount: { increment: due },
        version: { increment: 1 },
      },
    });
    added = added.add(due);
  }
  return added;
}

/**
 * Closes last year into this one, exactly once per balance — the OPENING ledger entry is the
 * record that it happened. What is carried is capped by the type's limit; no limit set means the
 * type does not carry forward. Whatever is not carried lapses, and last year's balance is emptied
 * so the same days cannot be taken twice.
 */
async function carryForward(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  balance: { id: string; employeeId: string; leaveTypeId: string; periodStart: Date },
  type: AccrualLeaveType,
) {
  const opened = await tx.leaveBalanceTransaction.findFirst({
    where: { leaveBalanceId: balance.id, transactionType: LeaveBalanceTransactionType.OPENING },
    select: { id: true },
  });
  if (opened) return new Prisma.Decimal(0);

  const lastDay = new Date(balance.periodStart.getTime() - 86_400_000);
  const previous = await tx.leaveBalance.findFirst({
    where: {
      organizationId: context.organizationId,
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      periodEnd: lastDay,
    },
  });
  const left = previous && previous.availableAmount.gt(0) ? previous.availableAmount : null;
  const limit = type.carryoverLimit ?? new Prisma.Decimal(0);
  const carried = left ? toHalfDays(Prisma.Decimal.min(left, limit)) : new Prisma.Decimal(0);

  if (previous && left) {
    const lapsed = left.sub(carried);
    await tx.leaveBalanceTransaction.create({
      data: movement(
        context,
        previous.id,
        LeaveBalanceTransactionType.EXPIRY,
        left.neg(),
        `Leave year closed: ${carried.toString()} carried forward, ${lapsed.toString()} lapsed`,
      ),
    });
    await tx.leaveBalance.update({
      where: { id: previous.id },
      data: { availableAmount: { decrement: left }, version: { increment: 1 } },
    });
  }
  await tx.leaveBalanceTransaction.create({
    data: movement(
      context,
      balance.id,
      LeaveBalanceTransactionType.OPENING,
      carried,
      carried.gt(0) ? 'Carried forward from last leave year' : 'Leave year opened',
    ),
  });
  if (carried.gt(0))
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        openingAmount: { increment: carried },
        availableAmount: { increment: carried },
        version: { increment: 1 },
      },
    });
  return carried;
}

function accrualReason(type: AccrualLeaveType) {
  return type.accrualType === 'MONTHLY' ? 'Monthly accrual' : 'Annual allowance';
}

function movement(
  context: DomainContext,
  leaveBalanceId: string,
  transactionType: LeaveBalanceTransactionType,
  amount: Prisma.Decimal,
  reason: string,
) {
  return {
    organizationId: context.organizationId,
    leaveBalanceId,
    transactionType,
    amount,
    reason,
    createdByUserId: context.actor.userId,
    createdByClientId: context.actor.clientId,
  };
}
