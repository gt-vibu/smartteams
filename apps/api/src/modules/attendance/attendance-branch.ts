import type { Prisma } from '../../generated/prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

/**
 * Which branch a punch is filed under.
 *
 * Belonging to a branch and working at it on a given day are different things: someone on two
 * branches checks in at one of them. The punch names the branch; this checks the person actually
 * belongs to it on that date, primary or additional, and otherwise refuses rather than filing
 * attendance at a branch they have nothing to do with. With no branch named, it is the primary
 * branch that covered that day — which, for a day before a transfer, is the old one.
 *
 * An employee with no branch at all is left as before, so people onboarded without one can still
 * record attendance.
 */
export async function branchForPunch(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employee: { id: string; firstName: string; primaryBranchId: string | null },
  workDate: Date,
  requested: string | undefined,
) {
  const onDay = await tx.employeeBranchAssignment.findMany({
    where: {
      organizationId,
      employeeId: employee.id,
      startsOn: { lte: workDate },
      OR: [{ endsOn: null }, { endsOn: { gte: workDate } }],
    },
    select: { branchId: true, isPrimary: true },
  });
  const allowed = new Set(onDay.map((row) => row.branchId));
  // An employee whose primary has no history row yet still belongs to it.
  const everHasRows =
    onDay.length > 0 ||
    (await tx.employeeBranchAssignment.count({
      where: { organizationId, employeeId: employee.id },
    })) > 0;
  if (!everHasRows && employee.primaryBranchId) allowed.add(employee.primaryBranchId);

  if (!requested)
    return onDay.find((row) => row.isPrimary)?.branchId ?? employee.primaryBranchId ?? undefined;

  const branch = await tx.branch.findFirst({
    where: { id: requested, organizationId },
    select: { name: true, status: true },
  });
  if (!branch) throw new NotFoundError('Branch');
  if (allowed.size === 0 && !employee.primaryBranchId) return requested;
  if (!allowed.has(requested))
    throw new ConflictError(
      `${employee.firstName} does not belong to ${branch.name} on ${workDate.toISOString().slice(0, 10)}, so attendance cannot be recorded there.`,
    );
  return requested;
}
