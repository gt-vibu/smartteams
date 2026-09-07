import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertApprover, assertResolvableApprovers } from '../approvals/approval-authorization';
import { markPayrollStale } from '../payroll/payroll-staleness';
import {
  attendanceTotals,
  correctionPunchUpdates,
  dayStatusFromSnapshot,
} from './attendance-shared';

/**
 * Raising a correction request and deciding on it.
 *
 * The two operations that change something: an employee disputes a record, an approver accepts or
 * rejects the dispute. Both rewrite the underlying attendance record through the same path, which
 * is why they belong together and the lists that merely display them do not.
 */
@Injectable()
export class AttendanceCorrectionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async requestCorrection(
    context: DomainContext,
    attendanceId: string,
    input: { reason: string; afterSnapshot?: Record<string, unknown> },
  ) {
    requirePermission(context, 'attendance.corrections.write');
    requireReason(context, 'Attendance correction requires a reason');
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: {
          id: attendanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: {
          punches: true,
          employee: { include: { manager: { select: { userId: true } } } },
        },
      });
      if (!record) throw new NotFoundError('Attendance record');
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
          reason: input.reason,
          beforeSnapshot: jsonSnapshot(record),
          afterSnapshot: jsonSnapshot(input.afterSnapshot ?? record),
          status: 'PENDING',
          requestedByUserId: context.actor.userId,
          requestedByClientId: context.actor.clientId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ATTENDANCE_CORRECTION',
          entityId: correction.id,
          action: 'ATTENDANCE_CORRECTION_REQUESTED',
          afterState: jsonSnapshot(correction),
          reason: input.reason,
        },
        tx,
      );
      return correction;
    });
  }

  async decideCorrection(
    context: DomainContext,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ) {
    requirePermission(context, 'attendance.corrections.decide');
    requireReason(
      { ...context, reason: comment },
      'Attendance correction decisions require a comment',
    );
    return this.database.run(context, async (tx) => {
      const correction = await tx.attendanceCorrection.findFirst({
        where: {
          id: correctionId,
          organizationId: context.organizationId,
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          approvals: true,
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
          attendanceRecord: {
            include: {
              punches: { orderBy: { occurredAt: 'asc' } },
              employee: { include: { manager: { select: { userId: true } } } },
            },
          },
        },
      });
      if (!correction) throw new NotFoundError('Attendance correction');
      if (correction.status !== 'PENDING')
        throw new ConflictError('Attendance correction is already decided');
      const approverUserId = context.actor.userId;
      if (!approverUserId) throw new ConflictError('A human approver is required');
      const pendingStep = correction.approvalPolicy?.steps.find(
        (step) =>
          !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
      );
      if (!pendingStep)
        throw new ConflictError('Attendance correction has no pending approval step');
      await assertApprover(
        tx,
        context.organizationId,
        approverUserId,
        correction.attendanceRecord.employee.manager?.userId,
        pendingStep.approverType,
        pendingStep.roleId,
        pendingStep.approverUserId,
        correction.attendanceRecord.branchId ?? context.branchId,
        correction.attendanceRecord.employee.userId,
      );
      const stepNumber = pendingStep.stepNumber;
      const hasMoreSteps = Boolean(
        correction.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber),
      );
      const finalStatus = status === 'REJECTED' || !hasMoreSteps ? status : 'PENDING';
      const updated = await tx.attendanceCorrection.update({
        where: { id: correction.id },
        data: {
          status: finalStatus,
          approvals: {
            create: {
              organizationId: context.organizationId,
              approverUserId,
              approvalPolicyStepId: pendingStep.id,
              status,
              comment,
              stepNumber,
            },
          },
        },
      });
      let correctedRecord;
      if (status === 'APPROVED' && !hasMoreSteps) {
        const punchUpdates = correctionPunchUpdates(
          correction.attendanceRecord.punches,
          correction.afterSnapshot,
        );
        await Promise.all(
          punchUpdates.map((update) =>
            tx.attendancePunch.update({
              where: { id: update.id },
              data: { occurredAt: update.occurredAt },
            }),
          ),
        );
        const updatedTimes = new Map(punchUpdates.map((update) => [update.id, update.occurredAt]));
        const correctedPunches = correction.attendanceRecord.punches.map((punch) => ({
          punchType: punch.punchType,
          occurredAt: updatedTimes.get(punch.id) ?? punch.occurredAt,
        }));
        const settings = await tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
          select: { standardDayMinutes: true },
        });
        const totals = attendanceTotals(correctedPunches, settings.standardDayMinutes);
        const correctedDayStatus = dayStatusFromSnapshot(correction.afterSnapshot);
        correctedRecord = await tx.attendanceRecord.update({
          where: { id: correction.attendanceRecordId },
          data: {
            status: AttendanceStatus.CORRECTED,
            correctionNote: correction.reason,
            workedMinutes: totals.workedMinutes,
            overtimeMinutes: totals.overtimeMinutes,
            ...(correctedDayStatus ? { dayStatus: correctedDayStatus } : {}),
            version: { increment: 1 },
          },
        });
        await markPayrollStale(
          tx,
          context.organizationId,
          correction.attendanceRecord.workDate,
          correction.attendanceRecord.workDate,
        );
      }
      await this.audit.record(
        context,
        {
          entityType: 'ATTENDANCE_CORRECTION',
          entityId: correction.id,
          action: `ATTENDANCE_CORRECTION_${status}`,
          beforeState: jsonSnapshot(correction),
          afterState: jsonSnapshot({ correction: updated, attendanceRecord: correctedRecord }),
          reason: comment,
        },
        tx,
      );
      return updated;
    });
  }
}
