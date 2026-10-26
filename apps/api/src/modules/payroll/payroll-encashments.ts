import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Approved leave encashments become pay in the first run calculated after they were approved.
 *
 * Each is attached once: it is written as a payroll adjustment on this run and marked with the
 * run, so a recalculation finds it already there and a later run never pays it twice. One
 * approved after the period ended waits for the next period's run.
 */
export async function attachApprovedEncashments(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  run: { id: string; periodEnd: Date },
) {
  const due = await tx.leaveEncashment.findMany({
    where: {
      organizationId: context.organizationId,
      status: 'APPROVED',
      payrollRunId: null,
      amount: { not: null },
      decidedAt: { lte: new Date(run.periodEnd.getTime() + 86_400_000) },
      employee: { status: 'ACTIVE' },
    },
    include: { leaveType: { select: { name: true } } },
  });
  for (const encashment of due) {
    await tx.payrollAdjustment.create({
      data: {
        organizationId: context.organizationId,
        payrollRunId: run.id,
        employeeId: encashment.employeeId,
        // Paid out as a taxable earning. `OTHER` is counted with the deductions, so the first
        // version of this took the encashed days' value off the employee's pay instead.
        type: 'BONUS',
        source: 'SYSTEM',
        description: `Leave encashment: ${encashment.days.toString()} days of ${encashment.leaveType.name}`,
        amount: encashment.amount!,
        taxable: true,
        createdByUserId: context.actor.userId ?? null,
      },
    });
    await tx.leaveEncashment.update({
      where: { id: encashment.id },
      data: { payrollRunId: run.id },
    });
  }
  return due.length;
}
