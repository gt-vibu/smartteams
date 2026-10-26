import type { Prisma } from '../../generated/prisma/client';

/**
 * The organization's main branch: the one it chose, while that branch is active, and otherwise
 * its oldest active branch — the one registration created. New hires are placed there unless
 * someone picks another, and a blank branch on an imported row means it.
 */
export async function primaryBranchOf(tx: Prisma.TransactionClient, organizationId: string) {
  const settings = await tx.organizationSettings.findUnique({
    where: { organizationId },
    select: { primaryBranchId: true },
  });
  if (settings?.primaryBranchId) {
    const chosen = await tx.branch.findFirst({
      where: { id: settings.primaryBranchId, organizationId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    if (chosen) return { ...chosen, chosen: true };
  }
  const oldest = await tx.branch.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });
  return oldest ? { ...oldest, chosen: false } : null;
}
