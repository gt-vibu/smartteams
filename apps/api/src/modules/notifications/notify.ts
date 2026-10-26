import type { Prisma } from '../../generated/prisma/client';
import { ApproverType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { activeManagerUserId, delegatesOf } from '../approvals/approval-authorization';

/**
 * Writing notifications, from inside the transaction of the action they are about.
 *
 * Called from the workflow services rather than after them, so a notification exists exactly when
 * its action committed, and carries the moment it happened — never one invented afterwards, and
 * never one for an action that failed.
 *
 * Only for the app. Federation partners run their own notifications, and their runtime contract
 * is frozen, so a partner's call writes nothing here.
 */

export type NotificationInput = {
  /** Who should see it. The person who caused it is always left out. */
  recipients: ReadonlyArray<string | null | undefined>;
  kind: string;
  title: string;
  body: string;
  /** Where to act on it: 'approvals' for a pending decision, else the request's own screen. */
  module?: string;
  entityType?: string;
  entityId?: string;
};

export async function notify(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  input: NotificationInput,
) {
  if (context.accessMode !== 'NATIVE') return;
  const actor = context.actor.userId ?? null;
  const recipients = [
    ...new Set(input.recipients.filter((id): id is string => Boolean(id))),
  ].filter((id) => id !== actor);
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((recipientUserId) => ({
      organizationId: context.organizationId,
      recipientUserId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: actor,
    })),
  });
}

/** Active people holding any of `permissions` through a role in force today. */
export async function permissionHolders(
  tx: Prisma.TransactionClient,
  organizationId: string,
  permissions: string[],
) {
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { isActive: true },
      role: { permissions: { some: { permission: { key: { in: [...permissions, '*'] } } } } },
    },
    select: { userId: true },
  });
  return [...new Set(holders.map((holder) => holder.userId))];
}

/**
 * The people who may decide one approval step: exactly those `canApprove` would let through.
 * A named user, the requester's manager, or every active holder of a role (in the branch, when
 * the role is branch-scoped). The requester is never their own approver.
 */
export async function stepApprovers(
  tx: Prisma.TransactionClient,
  organizationId: string,
  step: { approverType: ApproverType; roleId: string | null; approverUserId: string | null },
  requester: { userId: string | null; managerUserId: string | null },
  branchId?: string | null,
): Promise<string[]> {
  const exclude = (ids: Array<string | null>) =>
    ids.filter((id): id is string => Boolean(id) && id !== requester.userId);
  // Whoever is standing in for an approver today is told too: they can act on it.
  const withDelegates = async (ids: string[]) =>
    exclude([...ids, ...(await delegatesOf(tx, organizationId, ids))]);
  if (step.approverType === ApproverType.USER) return withDelegates(exclude([step.approverUserId]));
  if (step.approverType === ApproverType.MANAGER) {
    const manager = await activeManagerUserId(
      tx,
      organizationId,
      requester.managerUserId,
      requester.userId,
    );
    if (manager) return withDelegates(exclude([manager]));
    // No manager to ask: the step's backup role, when it has one, is who decides.
  }
  if (!step.roleId) return [];
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      roleId: step.roleId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
      user: { isActive: true },
    },
    select: { userId: true },
  });
  return withDelegates(exclude(holders.map((holder) => holder.userId)));
}

/** The requester's own login and their manager's, for routing. */
export async function requesterRouting(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
) {
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      manager: { select: { userId: true } },
    },
  });
  return {
    userId: employee?.userId ?? null,
    managerUserId: employee?.manager?.userId ?? null,
    name: employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'An employee',
  };
}

/** A date range the way a person reads it: "12 Oct" or "12 – 14 Oct 2026". */
export function describeDays(start: Date, end: Date) {
  const day = (date: Date, withYear: boolean) =>
    date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return start.getTime() === end.getTime()
    ? day(start, true)
    : `${day(start, false)} – ${day(end, true)}`;
}
