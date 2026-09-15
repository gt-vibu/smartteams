import { ApproverType } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';

export async function assertApprover(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  managerUserId: string | null | undefined,
  approverType: ApproverType,
  roleId: string | null,
  approverUserId: string | null,
  branchId?: string,
  requesterUserId?: string | null,
) {
  if (
    await canApprove(
      tx,
      organizationId,
      userId,
      managerUserId,
      approverType,
      roleId,
      approverUserId,
      branchId,
      requesterUserId,
    )
  )
    return;
  throw new ForbiddenDomainError('The current user is not authorized for this approval step');
}

export async function canApprove(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  managerUserId: string | null | undefined,
  approverType: ApproverType,
  roleId: string | null,
  approverUserId: string | null,
  branchId?: string,
  requesterUserId?: string | null,
) {
  if (requesterUserId && requesterUserId === userId) return false;
  if (approverType === ApproverType.USER || approverType === ApproverType.MANAGER) {
    const expectedUserId = approverType === ApproverType.USER ? approverUserId : managerUserId;
    if (expectedUserId !== userId) return false;
    return Boolean(
      await tx.employee.findFirst({
        where: {
          organizationId,
          userId,
          status: 'ACTIVE',
          user: { is: { isActive: true } },
        },
        select: { id: true },
      }),
    );
  }
  if (!roleId) return false;
  return Boolean(
    await tx.userRole.findFirst({
      where: {
        userId,
        organizationId,
        roleId,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
        user: { isActive: true },
      },
      select: { id: true },
    }),
  );
}

export async function assertResolvableApprovers(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  managerUserId: string | null | undefined,
  requesterUserId: string | null | undefined,
  steps: ReadonlyArray<{
    approverType: ApproverType;
    roleId: string | null;
    approverUserId: string | null;
  }>,
) {
  for (const step of steps) {
    if (step.approverType === ApproverType.MANAGER) {
      if (!managerUserId)
        throw new ConflictError(
          'The requesting employee does not have an active reporting manager',
        );
      if (managerUserId === requesterUserId)
        throw new ConflictError('An employee cannot approve their own request');
      const manager = await tx.employee.findFirst({
        where: {
          organizationId,
          userId: managerUserId,
          status: 'ACTIVE',
          user: { is: { isActive: true } },
        },
        select: { id: true },
      });
      if (!manager)
        throw new ConflictError(
          'The requesting employee does not have an active reporting manager',
        );
      continue;
    }
    if (step.approverType === ApproverType.USER) {
      if (!step.approverUserId) throw new ConflictError('A direct employee approver is required');
      if (step.approverUserId === requesterUserId)
        throw new ConflictError('An employee cannot approve their own request');
      const approver = await tx.employee.findFirst({
        where: {
          organizationId,
          userId: step.approverUserId,
          status: 'ACTIVE',
          OR: [
            { primaryBranchId: branchId },
            {
              branchAssignments: {
                some: { branchId, startsOn: { lte: new Date() }, endsOn: null },
              },
            },
          ],
          user: { is: { isActive: true } },
        },
        select: { id: true },
      });
      if (!approver)
        throw new ConflictError(
          'The selected direct employee approver is not active for this branch',
        );
      continue;
    }
    if (!step.roleId) throw new ConflictError('A workforce approval role is required');
    const member = await tx.userRole.findFirst({
      where: {
        organizationId,
        roleId: step.roleId,
        ...(requesterUserId ? { userId: { not: requesterUserId } } : {}),
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        AND: [{ OR: [{ branchId: null }, { branchId }] }],
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!member)
      throw new ConflictError(
        'The selected workforce approval role has no active member for this branch',
      );
  }
}
