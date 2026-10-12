import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
export async function decisionComments(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  requests: ReadonlyArray<{ id: string }>,
) {
  if (context.accessMode !== 'NATIVE' || requests.length === 0) return null;
  const decided = await tx.leaveApproval.findMany({
    where: {
      organizationId: context.organizationId,
      leaveRequestId: { in: requests.map((request) => request.id) },
      comment: { not: null },
      decidedAt: { not: null },
    },
    orderBy: { decidedAt: 'desc' },
    select: { leaveRequestId: true, comment: true },
  });
  const latest = new Map<string, string>();
  for (const row of decided)
    if (row.comment && !latest.has(row.leaveRequestId)) latest.set(row.leaveRequestId, row.comment);
  return latest;
}
