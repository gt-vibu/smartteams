import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { assertResolvableApprovers } from '../approvals/approval-authorization';
import type { AuditService } from '../audit/audit.service';
import { jsonSnapshot } from '../audit/audit.service';
import { describeDays, notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { shouldAutoApproveCorrection } from './attendance-automation';

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
  automaticallyDecide?: (id: string, reason: string) => Promise<unknown>,
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
  const automaticallyApproved =
    Boolean(automaticallyDecide) &&
    context.accessMode === 'NATIVE' &&
    (await shouldAutoApproveCorrection(
      tx,
      context.organizationId,
      record.id,
      policy.automation,
      afterSnapshot,
    ));
  if (!automaticallyApproved)
    await assertResolvableApprovers(
      tx,
      context.organizationId,
      correctionBranchId,
      record.employee.manager?.userId,
      record.employee.userId,
      policy.steps,
    );
  if (context.accessMode === 'NATIVE')
    await tx.$queryRaw`SELECT run.id FROM payroll_runs run JOIN attendance_records record ON record.id = ${record.id}::uuid AND record.organization_id = run.organization_id WHERE run.organization_id = ${context.organizationId}::uuid AND run.period_start <= record.work_date AND run.period_end >= record.work_date FOR UPDATE OF run`;
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
  if (automaticallyApproved && automaticallyDecide) {
    await automaticallyDecide(
      correction.id,
      `Automatically approved — ${policy.name} (${policy.id})`,
    );
    return { ...correction, status: 'APPROVED' as const };
  }
  const firstStep = policy.steps[0];
  const day = await tx.attendanceRecord.findUnique({
    where: { id: record.id },
    select: { employeeId: true, workDate: true },
  });
  if (firstStep && day) {
    const requester = await requesterRouting(tx, context.organizationId, day.employeeId);
    await notify(tx, context, {
      recipients: await stepApprovers(
        tx,
        context.organizationId,
        firstStep,
        requester,
        correctionBranchId,
      ),
      kind: 'ATTENDANCE_CORRECTION_PENDING',
      title: 'Attendance correction awaiting your decision',
      body: `${requester.name}'s attendance for ${describeDays(day.workDate, day.workDate)}: ${reason}`,
      module: 'approvals',
      entityType: 'ATTENDANCE_CORRECTION',
      entityId: correction.id,
    });
  }
  return correction;
}
