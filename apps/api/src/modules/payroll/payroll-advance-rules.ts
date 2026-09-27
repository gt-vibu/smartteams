import { Prisma } from '../../generated/prisma/client';
import { SalaryAdvanceStatus } from '../../generated/prisma/enums';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { organizationToday } from '../employees/employee-branch-rules';

/** The organization's rules for salary advances, as an administrator set them. */
export type AdvanceRules = { limitPercent: number; recoveryMonths: number };

export const DEFAULT_ADVANCE_RULES: AdvanceRules = { limitPercent: 50, recoveryMonths: 1 };

export async function readAdvanceRules(
  tx: TenantTransaction,
  organizationId: string,
): Promise<AdvanceRules> {
  const settings = await tx.organizationSettings.findUnique({
    where: { organizationId },
    select: { advanceLimitPercent: true, advanceRecoveryMonths: true },
  });
  return settings
    ? { limitPercent: settings.advanceLimitPercent, recoveryMonths: settings.advanceRecoveryMonths }
    : DEFAULT_ADVANCE_RULES;
}

/**
 * The monthly salary an advance limit is a share of: the gross of a salaried employee's pay in
 * force today. Someone paid by the hour, day or shift has no fixed month, so their last released
 * pay stands in. Null when neither exists — there is nothing to measure an advance against.
 */
async function monthlySalary(tx: TenantTransaction, organizationId: string, employeeId: string) {
  const today = await organizationToday(tx, organizationId);
  const pay = await tx.employeeCompensation.findFirst({
    where: {
      organizationId,
      employeeId,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { payType: true, grossSalary: true, baseAmount: true },
  });
  if (pay?.payType === 'SALARY') return pay.grossSalary ?? pay.baseAmount;
  const lastPay = await tx.payrollLineItem.findFirst({
    where: {
      organizationId,
      employeeId,
      payrollRun: { status: { in: ['RELEASED', 'LOCKED'] } },
    },
    orderBy: { payrollRun: { periodEnd: 'desc' } },
    select: { grossAmount: true },
  });
  return lastPay?.grossAmount ?? null;
}

/** Everything the employee has asked for and is waiting on, plus what they still owe. */
async function outstanding(tx: TenantTransaction, organizationId: string, employeeId: string) {
  const advances = await tx.salaryAdvance.findMany({
    where: {
      organizationId,
      employeeId,
      status: {
        in: [
          SalaryAdvanceStatus.REQUESTED,
          SalaryAdvanceStatus.APPROVED,
          SalaryAdvanceStatus.PARTIALLY_RECOVERED,
        ],
      },
    },
    select: { status: true, requestedAmount: true, approvedAmount: true, recoveredAmount: true },
  });
  // Kept apart so the employee sees which of it is waiting for a decision and which is being
  // taken back from their pay.
  let pending = new Prisma.Decimal(0);
  let repaying = new Prisma.Decimal(0);
  for (const advance of advances) {
    if (advance.status === SalaryAdvanceStatus.REQUESTED)
      pending = pending.add(advance.requestedAmount);
    else
      repaying = repaying.add(
        Prisma.Decimal.max(
          0,
          (advance.approvedAmount ?? new Prisma.Decimal(0)).sub(advance.recoveredAmount),
        ),
      );
  }
  return { pending, repaying };
}

/**
 * How much more this employee may ask for: the organization's percentage of their monthly salary,
 * less what they are already waiting on or still paying back.
 */
export async function advanceAllowance(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
) {
  const rules = await readAdvanceRules(tx, organizationId);
  const [salary, { pending, repaying }] = await Promise.all([
    monthlySalary(tx, organizationId, employeeId),
    outstanding(tx, organizationId, employeeId),
  ]);
  const limit = salary
    ? salary.mul(rules.limitPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
    : null;
  const owed = pending.add(repaying);
  const available = limit ? Prisma.Decimal.max(0, limit.sub(owed)) : null;
  return {
    ...rules,
    monthlySalary: salary ? Number(salary) : null,
    limit: limit ? Number(limit) : null,
    outstanding: Number(owed),
    /** Asked for and waiting on a decision. */
    pending: Number(pending),
    /** Approved and not yet taken back from pay. */
    repaying: Number(repaying),
    available: available ? Number(available) : 0,
  };
}

/**
 * The most one run takes back towards an advance: an equal share of it over the organization's
 * recovery months. The last share is whatever is left, so rounding never leaves a paisa owing.
 */
export function recoveryInstalment(approvedAmount: Prisma.Decimal, recoveryMonths: number) {
  return approvedAmount
    .div(Math.max(1, recoveryMonths))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}
