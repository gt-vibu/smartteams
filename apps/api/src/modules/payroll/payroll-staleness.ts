import { PayrollRunStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Marks a calculated payroll run as needing recalculation when one of its inputs changes.
 *
 * The mechanism already existed and already worked — `PayrollRunsService.addAdjustment` set
 * `calculationStaleAt`, and the transition guard refuses to approve or release a stale run. It
 * was only ever called from one place. Every other input the engine reads — approved leave,
 * attendance, compensation, advances, timesheets — could change after a run was calculated and
 * the run would still present itself as current, so it could be approved and released carrying
 * figures that no longer matched the data they were derived from.
 *
 * Deliberately narrow in two ways:
 *
 *  - Only `CALCULATED` runs are touched, matching the existing adjustment path. A `DRAFT` run has
 *    no calculation to invalidate, and a released one is past the gate — whether a released run
 *    should be flagged for correction is a policy question this code does not answer.
 *  - Runs already stale are left alone, so a burst of changes does not rewrite the timestamp and
 *    lose when the first divergence happened.
 */
export async function markPayrollStale(
  tx: Prisma.TransactionClient,
  organizationId: string,
  /** First date the change affects. */
  from: Date,
  /** Last date it affects; omit for an open-ended change such as a new compensation record. */
  to?: Date,
): Promise<number> {
  const result = await tx.payrollRun.updateMany({
    where: {
      organizationId,
      status: PayrollRunStatus.CALCULATED,
      calculationStaleAt: null,
      // Overlap, not containment: a change on any day the run covers invalidates it.
      periodStart: { lte: to ?? new Date('9999-12-31') },
      periodEnd: { gte: from },
    },
    data: { calculationStaleAt: new Date(), version: { increment: 1 } },
  });
  return result.count;
}
