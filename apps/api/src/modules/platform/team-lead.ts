import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { jsonSnapshot, type AuditService } from '../audit/audit.service';

/**
 * The lead leads the team; they are not also one of its members. When a current member is made
 * lead, their membership ends today — recorded and audited like any other ending, so their
 * history on the team is kept.
 */
export async function endLeadMembership(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  audit: AuditService,
  teamId: string,
  employeeId: string,
) {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const current = await tx.teamMember.findMany({
    where: { organizationId: context.organizationId, teamId, employeeId, leftAt: null },
  });
  for (const member of current) {
    const updated = await tx.teamMember.update({
      where: { id: member.id },
      // Never before they joined: a membership starting later simply ends as it starts.
      data: { leftAt: member.joinedAt > today ? member.joinedAt : today },
    });
    await audit.record(
      context,
      {
        entityType: 'TEAM_MEMBER',
        entityId: member.id,
        action: 'TEAM_MEMBER_ENDED',
        beforeState: jsonSnapshot(member),
        afterState: jsonSnapshot(updated),
      },
      tx,
    );
  }
}
