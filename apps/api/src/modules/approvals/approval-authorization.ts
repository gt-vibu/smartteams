import { ApproverType } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { ForbiddenDomainError } from '../../common/errors/domain-error';

export async function assertApprover(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  managerUserId: string | null | undefined,
  approverType: ApproverType,
  roleId: string | null,
  approverUserId: string | null,
  branchId?: string,
) {
  if (approverType === ApproverType.USER && approverUserId === userId) return;
  if (approverType === ApproverType.MANAGER && managerUserId === userId) return;
  if (
    approverType === ApproverType.ROLE &&
    roleId &&
    (await tx.userRole.findFirst({
      where: {
        userId,
        organizationId,
        roleId,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
      },
    }))
  )
    return;
  throw new ForbiddenDomainError('The current user is not authorized for this approval step');
}
