import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { AuditService } from '../audit/audit.service';
import { jsonSnapshot } from '../audit/audit.service';
import { assertResolvableApprovers } from '../approvals/approval-authorization';

/** The fields of an attendance record a correction is routed and snapshotted from. */
export type CorrectableRecord = {
  id: string;
  branchId: string | null;
  employee: { userId: string | null; manager: { userId: string | null } | null };
};

/**
 * Routes a correction through the organization's approval policy and records it.
 *
 * Extracted from `AttendanceCorrectionsService` unchanged so the automatic day close raises the
 * same correction, against the same policy, with the same audit entry — rather than a second kind
 * of request nobody's inbox knows about. Who approves it is therefore the organization's own
 * ATTENDANCE_CORRECTION policy: their manager, a role, or named people, configured on the
 * Approvals screen.
 */
export async function createAttendanceCorrection(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  context: DomainContext,
  record: CorrectableRecord,
  reason: string,
  afterSnapshot: unknown,
) {
  const activePolicies = await tx.approvalPolicy.findMany({
    where: {
      organizationId: context.organizationId,
      domain: 'ATTENDANCE_CORRECTION',
      isActive: true,
    },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const policy =
    activePolicies.find((candidate) => candidate.isDefault) ??
    (activePolicies.length === 1 ? activePolicies[0] : undefined);
  if (!policy)
    throw new ConflictError(
      'Configure a default attendance correction approval policy before submitting corrections',
    );
  const correctionBranchId = record.branchId ?? context.branchId;
  if (!correctionBranchId)
    throw new ConflictError('An outlet is required to resolve attendance approvers');
  await assertResolvableApprovers(
    tx,
    context.organizationId,
    correctionBranchId,
    record.employee.manager?.userId,
    record.employee.userId,
    policy.steps,
  );
  const correction = await tx.attendanceCorrection.create({
    data: {
      organizationId: context.organizationId,
      attendanceRecordId: record.id,
      approvalPolicyId: policy.id,
      reason,
      beforeSnapshot: jsonSnapshot(record),
      afterSnapshot: jsonSnapshot(afterSnapshot),
      status: 'PENDING',
      requestedByUserId: context.actor.userId,
      requestedByClientId: context.actor.clientId,
    },
  });
  await audit.record(
    context,
    {
      entityType: 'ATTENDANCE_CORRECTION',
      entityId: correction.id,
      action: 'ATTENDANCE_CORRECTION_REQUESTED',
      afterState: jsonSnapshot(correction),
      reason,
    },
    tx,
  );
  return correction;
}
