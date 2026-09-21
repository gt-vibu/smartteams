import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import {
  assertAfterJoining,
  dayBefore,
  isoDay,
  overlaps,
  syncPrimaryBranch,
  type MembershipRow,
} from './employee-branch-rules';

/**
 * Moves an employee's primary branch from `from`.
 *
 * Shared by the explicit transfer and by an edit that changes the primary branch, so the two
 * cannot disagree: whichever way someone moves, the old primary ends the day before, the new one
 * starts, and nothing is overwritten. Returns the new row, or null when that branch is already
 * the primary.
 */
export async function transferPrimary(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  employee: { id: string; firstName: string; dateOfJoining: Date | null },
  rows: MembershipRow[],
  branch: { id: string; name: string },
  from: Date,
  today: Date,
) {
  assertAfterJoining(employee, from);
  const current = rows.find((row) => row.isPrimary && !row.endsOn);
  if (current && current.startsOn > today)
    throw new ConflictError(
      `A move to another branch is already scheduled for ${isoDay(current.startsOn)}. Cancel it before scheduling another.`,
    );
  if (current?.branchId === branch.id) return { created: null, previous: current };
  if (current && from <= current.startsOn)
    throw new ConflictError(
      `The current primary branch began on ${isoDay(current.startsOn)}; a transfer must start after that.`,
    );

  for (const row of rows) {
    if (row.isPrimary || row.branchId !== branch.id) continue;
    if (!overlaps(row, { startsOn: from, endsOn: null })) continue;
    if (row.startsOn >= from)
      throw new ConflictError(
        `${employee.firstName} has an upcoming membership at ${branch.name} from ${isoDay(row.startsOn)}. Cancel it first.`,
      );
    // A scheduled transfer can still be cancelled, and cancelling could not tell what end date
    // this membership had before the transfer cut it short. So only a transfer that has already
    // taken effect folds it in; a future one asks for it to be ended explicitly.
    if (from > today)
      throw new ConflictError(
        `${branch.name} is already an additional branch for ${employee.firstName}. End that membership on ${isoDay(dayBefore(from))} first, or make the transfer effective today.`,
      );
    await tx.employeeBranchAssignment.update({
      where: { id: row.id },
      data: { endsOn: dayBefore(from) },
    });
  }
  if (current)
    await tx.employeeBranchAssignment.update({
      where: { id: current.id },
      data: { endsOn: dayBefore(from) },
    });
  const created = await tx.employeeBranchAssignment.create({
    data: {
      organizationId: context.organizationId,
      employeeId: employee.id,
      branchId: branch.id,
      isPrimary: true,
      startsOn: from,
      sourceAccessMode: context.accessMode,
    },
  });
  // Today's primary moves now; a future one moves on its day, by the scheduled sweep.
  await syncPrimaryBranch(tx, context.organizationId, employee.id, today);
  return { created, previous: current ?? null };
}
