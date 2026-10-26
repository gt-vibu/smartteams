import { leaveWorkflowSettingsSchema } from '@smarteam/contracts';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { approvalLocalDate } from '../approvals/approval-automation';
import { jsonSnapshot } from '../audit/audit.service';
import { notify } from '../notifications/notify';

export function workflowSettings(metadata: Prisma.JsonValue | undefined) {
  const value =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.leaveWorkflow
      : undefined;
  return leaveWorkflowSettingsSchema.parse(value ?? {});
}

/** Approved leave stays approved until an authorized reviewer accepts its cancellation. */
export async function requestCancellation(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  request: {
    id: string;
    startDate: Date;
    branchId: string | null;
    cancellation?: Prisma.JsonValue | null;
  },
  reason: string,
) {
  const previous = request.cancellation;
  if (
    previous &&
    typeof previous === 'object' &&
    !Array.isArray(previous) &&
    previous.status === 'PENDING'
  )
    throw new ConflictError('Cancellation is already awaiting HR review.');
  const settings = await tx.organizationSettings.findUnique({
    where: { organizationId: context.organizationId },
  });
  const rule = workflowSettings(settings?.metadata);
  const today = await approvalLocalDate(tx, context.organizationId, request.branchId);
  const daysUntilStart =
    (request.startDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000;
  const mode = daysUntilStart <= 0 ? rule.startedCancellation : rule.futureCancellation;
  if (mode === 'DISABLED')
    throw new ConflictError('Cancellation is disabled for these dates. Contact HR.');
  if (mode === 'IMMEDIATE' && daysUntilStart >= rule.minimumNoticeDays) return null;
  if (!context.actor.userId)
    throw new ConflictError('A signed-in employee must request cancellation.');
  const cancellation = {
    status: 'PENDING',
    reason,
    requestedAt: new Date().toISOString(),
    requestedByUserId: context.actor.userId,
  };
  const updated = await tx.leaveRequest.update({
    where: { id: request.id },
    data: { cancellation: jsonSnapshot(cancellation), version: { increment: 1 } },
  });
  const reviewers = await tx.userRole.findMany({
    where: {
      organizationId: context.organizationId,
      role: { code: { in: ['ORG_ADMIN', 'HR_ADMIN'] } },
      startsAt: { lte: new Date() },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      user: { isActive: true },
    },
    select: { userId: true },
  });
  await notify(tx, context, {
    recipients: reviewers.map((item) => item.userId),
    kind: 'LEAVE_CANCELLATION_PENDING',
    title: 'Leave cancellation needs review',
    body: `Request ${request.id}: ${reason}`,
    module: 'approvals',
    entityType: 'LEAVE_REQUEST',
    entityId: request.id,
  });
  return updated;
}
