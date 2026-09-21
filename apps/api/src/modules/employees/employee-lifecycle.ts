import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';

/**
 * When someone leaves, the teams, projects and shift they were on end on their last day. Nothing
 * is deleted: the ended rows are the history that attendance, timesheets and reports read, and a
 * membership that already ended earlier keeps its own date.
 */
export async function endCurrentRelationships(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
  lastDay: Date,
) {
  const scope = { organizationId, employeeId };
  await tx.teamMember.updateMany({
    where: { ...scope, OR: [{ leftAt: null }, { leftAt: { gt: lastDay } }] },
    data: { leftAt: lastDay },
  });
  await tx.projectMember.updateMany({
    where: { ...scope, OR: [{ endsOn: null }, { endsOn: { gt: lastDay } }] },
    data: { endsOn: lastDay },
  });
  await tx.employeeShiftAssignment.updateMany({
    where: { ...scope, OR: [{ endsOn: null }, { endsOn: { gt: lastDay } }] },
    data: { endsOn: lastDay },
  });
  // Branches too, the primary included: they were at that branch until their last day. A
  // membership that would only have begun after they left never happened, so it is removed —
  // ending it on their last day would put its end before its start.
  await tx.employeeBranchAssignment.deleteMany({
    where: { ...scope, startsOn: { gt: lastDay } },
  });
  await tx.employeeBranchAssignment.updateMany({
    where: { ...scope, OR: [{ endsOn: null }, { endsOn: { gt: lastDay } }] },
    data: { endsOn: lastDay },
  });
}
