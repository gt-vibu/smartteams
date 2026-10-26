import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';
import { jsonSnapshot, type AuditService } from '../audit/audit.service';
import { organizationToday } from '../employees/employee-branch-rules';
import { ensureEntry } from './picklist-catalog';

export type InitialMember = { employeeId: string; projectRole?: string };

/** Validate the entire selection before creating the group, inside the same transaction. */
export async function validateInitialMembers(
  tx: Prisma.TransactionClient, context: DomainContext, members: readonly InitialMember[], lead?: string,
) {
  if (!members.length) return;
  if (members.length > 1000) throw new ConflictError('Choose at most 1,000 initial members.');
  const ids = members.map((member) => member.employeeId);
  if (new Set(ids).size !== ids.length) throw new ConflictError('Each member may be selected once.');
  if (lead && ids.includes(lead)) throw new ConflictError('The lead cannot also be an initial member.');
  const employees = await tx.employee.findMany({
    where: { organizationId: context.organizationId, id: { in: ids }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (employees.length !== ids.length)
    throw new ConflictError('Some selected employees are unavailable. Refresh the selection and try again.');
}

export async function createInitialMembers(
  tx: Prisma.TransactionClient, context: DomainContext, audit: AuditService,
  kind: 'TEAM' | 'PROJECT', groupId: string, members: readonly InitialMember[], startDate?: Date,
) {
  if (!members.length) return;
  const startsOn = startDate ?? await organizationToday(tx, context.organizationId);
  for (const member of members) {
    const row = kind === 'TEAM'
      ? await tx.teamMember.create({ data: {
          organizationId: context.organizationId, teamId: groupId,
          employeeId: member.employeeId, joinedAt: startsOn,
        } })
      : await tx.projectMember.create({ data: {
          organizationId: context.organizationId, projectId: groupId,
          employeeId: member.employeeId, startsOn,
          projectRole: await ensureEntry(tx, context, 'project-roles', member.projectRole),
        } });
    await audit.record(context, {
      entityType: `${kind}_MEMBER`, entityId: row.id,
      action: `${kind}_MEMBER_ADDED`, afterState: jsonSnapshot(row),
    }, tx);
  }
}
