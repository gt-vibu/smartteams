import { Prisma, type LeaveBalance } from '../../generated/prisma/client';
import type { AccrualLeaveType } from './leave-accrual';
import { entitlement } from './leave-accrual';

/** Preview the reconciliation submission will perform, without writing a balance or ledger. */
export async function previewLeaveAvailable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
  type: AccrualLeaveType & { id: string },
  period: { periodStart: Date; periodEnd: Date },
  joinedOn: Date | null,
  balance: LeaveBalance | null,
  now = new Date(),
) {
  const target = entitlement(type, period, joinedOn, now);
  let available = balance
    ? balance.availableAmount.add(Prisma.Decimal.max(target.sub(balance.accruedAmount), 0))
    : target;
  if (period.periodStart > now) return Number(available);
  const opened =
    balance &&
    (await tx.leaveBalanceTransaction.findFirst({
      where: { organizationId, leaveBalanceId: balance.id, transactionType: 'OPENING' },
      select: { id: true },
    }));
  if (!opened) {
    const previous = await tx.leaveBalance.findFirst({
      where: {
        organizationId,
        employeeId,
        leaveTypeId: type.id,
        periodEnd: new Date(period.periodStart.getTime() - 86400000),
      },
    });
    if (previous && previous.availableAmount.gt(0)) {
      const carry = Prisma.Decimal.min(previous.availableAmount, type.carryoverLimit ?? 0)
        .mul(2)
        .floor()
        .div(2);
      available = available.add(carry);
    }
  }
  return Number(available);
}
