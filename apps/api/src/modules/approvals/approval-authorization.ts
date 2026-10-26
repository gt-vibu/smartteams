import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { ApproverType } from '../../generated/prisma/enums';

/** Read-only inbox cache, created per transaction; decisions always resolve authority again. */
export type ApprovalAuthorizationCache = Map<string, Promise<unknown>>;
function inboxLookup<T>(
  cache: ApprovalAuthorizationCache | undefined,
  key: unknown[],
  read: () => Promise<T>,
): Promise<T> {
  if (!cache) return read();
  const encoded = JSON.stringify(key);
  const existing = cache.get(encoded);
  if (existing) return existing as Promise<T>;
  const result = read();
  cache.set(encoded, result);
  return result;
}

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
  cache?: ApprovalAuthorizationCache,
) {
  if (requesterUserId && requesterUserId === userId) return false;
  // Whoever the caller is approving as: themselves, and anyone who has handed them their
  // approvals for today. Never the requester — a delegate does not approve their delegator's
  // own request on the delegator's behalf.
  const principals = [
    userId,
    ...(await inboxLookup(cache, ['delegators', organizationId, userId], () =>
      delegatorsOf(tx, organizationId, userId),
    )),
  ].filter((principal) => principal !== requesterUserId);
  if (approverType === ApproverType.MANAGER) {
    // The reporting manager when there is one; otherwise the step's backup role, if it has one.
    const manager =
      managerUserId && managerUserId !== requesterUserId
        ? await inboxLookup(cache, ['manager', organizationId, managerUserId], () =>
            activeManagerUserId(tx, organizationId, managerUserId, requesterUserId),
          )
        : null;
    if (manager) return principals.includes(manager);
    if (!roleId) return false;
  } else if (approverType === ApproverType.USER) {
    const expectedUserId = approverUserId;
    if (!expectedUserId || !principals.includes(expectedUserId)) return false;
    return Boolean(
      await inboxLookup(cache, ['user', organizationId, expectedUserId], () =>
        tx.employee.findFirst({
          where: {
            organizationId,
            userId: expectedUserId,
            status: 'ACTIVE',
            user: { is: { isActive: true } },
          },
          select: { id: true },
        }),
      ),
    );
  }
  if (!roleId) return false;
  return Boolean(
    await inboxLookup(cache, ['role', organizationId, roleId, branchId, principals], () =>
      tx.userRole.findFirst({
        where: {
          userId: { in: principals },
          organizationId,
          roleId,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
          user: { isActive: true },
        },
        select: { id: true },
      }),
    ),
  );
}

/**
 * The requester's reporting manager when they can act on a request: an active employee with an
 * active login who is not the requester. Null means a manager step falls to its backup role.
 */
export async function activeManagerUserId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  managerUserId: string | null | undefined,
  requesterUserId: string | null | undefined,
) {
  if (!managerUserId || managerUserId === requesterUserId) return null;
  const manager = await tx.employee.findFirst({
    where: {
      organizationId,
      userId: managerUserId,
      status: 'ACTIVE',
      user: { is: { isActive: true } },
    },
    select: { id: true },
  });
  return manager ? managerUserId : null;
}

/** Today as a calendar date, the way delegation spans are stored. */
export function today(now = new Date()) {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** The people who have handed `userId` their approvals for today. */
export async function delegatorsOf(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const day = today();
  const rows = await tx.approvalDelegation.findMany({
    where: {
      organizationId,
      delegateUserId: userId,
      revokedAt: null,
      // Only once the person covering has accepted (an administrator's handover is accepted when made).
      acceptedAt: { not: null },
      declinedAt: null,
      startsOn: { lte: day },
      endsOn: { gte: day },
      delegate: { isActive: true },
    },
    select: { delegatorUserId: true },
  });
  return rows.map((row) => row.delegatorUserId);
}

/** The people standing in today for any of `userIds`, so they are told what is waiting. */
export async function delegatesOf(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const day = today();
  const rows = await tx.approvalDelegation.findMany({
    where: {
      organizationId,
      delegatorUserId: { in: [...userIds] },
      revokedAt: null,
      // Only once the person covering has accepted (an administrator's handover is accepted when made).
      acceptedAt: { not: null },
      declinedAt: null,
      startsOn: { lte: day },
      endsOn: { gte: day },
      delegate: { isActive: true },
    },
    select: { delegateUserId: true },
  });
  return rows.map((row) => row.delegateUserId);
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
      if (await activeManagerUserId(tx, organizationId, managerUserId, requesterUserId)) continue;
      // No manager to ask: the step's backup role decides instead, checked like any role step.
      if (!step.roleId)
        throw new ConflictError(
          'You have no active reporting manager to approve this. Ask HR to set your manager, ' +
            'or an administrator to give this approval step a backup approver.',
        );
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
