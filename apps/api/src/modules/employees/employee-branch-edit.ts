import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import {
  calendarDate,
  ensurePrimaryRow,
  isoDay,
  memberships,
  organizationToday,
  overlaps,
} from './employee-branch-rules';
import { transferPrimary } from './employee-branch-transfer';

/**
 * What an ordinary employee edit does to their branch history.
 *
 * The edit form carries a primary branch and a joining date, both of which the history depends
 * on. Written straight onto the record they would leave it contradicting its own history, so:
 *
 *   - A new joining date moves the start of their first primary membership with it, provided
 *     nothing else they belong to would then begin before they joined.
 *   - A new primary branch is a transfer from today. If the current primary has not begun yet, or
 *     began today, there is no history to keep, so it is a correction of that row instead — the
 *     usual case being a branch picked wrongly at onboarding.
 */
export async function applyEmployeeBranchEdit(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  before: {
    id: string;
    firstName: string;
    primaryBranchId: string | null;
    dateOfJoining: Date | null;
  },
  change: { branch: { id: string; name: string } | null; dateOfJoining?: Date | null },
) {
  const today = await organizationToday(tx, context.organizationId);
  const joined = change.dateOfJoining === undefined ? before.dateOfJoining : change.dateOfJoining;

  if (change.dateOfJoining !== undefined && change.dateOfJoining) {
    const newStart = calendarDate(change.dateOfJoining);
    const rows = await memberships(tx, context.organizationId, before.id);
    const first = rows.find((row) => row.isPrimary);
    // Only the row derived from joining moves — dated from the old joining date, or from whenever
    // it was written if no joining date was known. One someone dated deliberately stays.
    const derived =
      first &&
      (!before.dateOfJoining ||
        first.startsOn.getTime() === calendarDate(before.dateOfJoining).getTime())
        ? first
        : null;
    if (derived && derived.endsOn && newStart > derived.endsOn)
      throw new ConflictError(
        `${before.firstName} moved branch on ${isoDay(derived.endsOn)}; the joining date cannot be after that.`,
      );
    const early = rows.find((row) => row.id !== derived?.id && row.startsOn < newStart);
    if (early)
      throw new ConflictError(
        `${before.firstName} belongs to a branch from ${isoDay(early.startsOn)}, before the new joining date.`,
      );
    if (derived && derived.startsOn.getTime() !== newStart.getTime())
      await tx.employeeBranchAssignment.update({
        where: { id: derived.id },
        data: { startsOn: newStart },
      });
  }

  if (!change.branch) return;
  const employee = { ...before, dateOfJoining: joined };
  const rows = await ensurePrimaryRow(
    tx,
    context.organizationId,
    employee,
    today,
    context.accessMode,
  );
  const current = rows.find((row) => row.isPrimary && !row.endsOn);

  if (current && current.startsOn >= today) {
    const clash = rows.find(
      (row) =>
        row.id !== current.id && row.branchId === change.branch?.id && overlaps(row, current),
    );
    if (clash)
      throw new ConflictError(
        `${before.firstName} already belongs to ${change.branch.name} for part of that time. End that membership first.`,
      );
    await tx.employeeBranchAssignment.update({
      where: { id: current.id },
      data: { branchId: change.branch.id },
    });
    await tx.employee.update({
      where: { id: before.id },
      data: { primaryBranchId: change.branch.id, version: { increment: 1 } },
    });
    return;
  }
  await transferPrimary(tx, context, employee, rows, change.branch, today, today);
}
