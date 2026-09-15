import { Injectable } from '@nestjs/common';
import {
  AttendancePunchSource,
  AttendancePunchType,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { assertMayActForEmployee } from '../employees/employee-scope';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertApprover, assertResolvableApprovers } from '../approvals/approval-authorization';
import { markPayrollStale } from '../payroll/payroll-staleness';
import {
  attendanceTotals,
  correctionPunchUpdates,
  dayStatusFromSnapshot,
} from './attendance-shared';
import {
  assertValidMissingCheckOut,
  missingCheckOutFrom,
  MISSING_CHECK_OUT_KEY,
  type PunchLike,
} from './attendance-missing-checkout';

/** The fields of an attendance record a correction is routed and snapshotted from. */
type CorrectableRecord = {
  id: string;
  branchId: string | null;
  employee: { userId: string | null; manager: { userId: string | null } | null };
};

/** The employee's first punch after this day's open check-in, on any day. */
async function nextPunchAfterOpenCheckIn(
  tx: Prisma.TransactionClient,
  record: { id: string; organizationId: string; employeeId: string; punches: PunchLike[] },
): Promise<Date | undefined> {
  const openAt = record.punches.at(-1)?.occurredAt;
  if (!openAt) return undefined;
  const next = await tx.attendancePunch.findFirst({
    where: {
      organizationId: record.organizationId,
      employeeId: record.employeeId,
      attendanceRecordId: { not: record.id },
      occurredAt: { gt: openAt },
    },
    orderBy: { occurredAt: 'asc' },
    select: { occurredAt: true },
  });
  return next?.occurredAt;
}

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
      // The record is reached by its own id, so ownership comes off the row rather than the
      // request. Without this an employee holding `attendance.corrections.write` — which every
      // seeded employee holds — could raise a correction against a colleague's day.
      await assertMayActForEmployee(tx, context, record.employeeId, 'attendance.read.all');
      return this.createCorrection(
        tx,
        context,
        record,
        input.reason,
        input.afterSnapshot ?? record,
      );
    });
  }

  /**
   * Asks for the check-out a day never had to be added, at the time the employee states.
   *
   * Called only by the native controller's own route. It goes through the same approval policy as
   * any correction and changes nothing until the final approver accepts it; see
   * `attendance-missing-checkout.ts` for why it exists and what it will not do.
   */
  async requestMissingCheckOut(
    context: DomainContext,
    attendanceId: string,
    input: { checkOutAt: string; reason: string },
  ) {
    requirePermission(context, 'attendance.corrections.write');
    requireReason({ ...context, reason: input.reason }, 'Attendance correction requires a reason');
    const checkOut = new Date(input.checkOutAt);
    if (Number.isNaN(checkOut.getTime())) throw new ConflictError('The check-out time is invalid');
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: {
          id: attendanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: {
          punches: { orderBy: { occurredAt: 'asc' } },
          employee: { include: { manager: { select: { userId: true } } } },
        },
      });
      if (!record) throw new NotFoundError('Attendance record');
      // Ownership off the row, exactly as the general correction does.
      await assertMayActForEmployee(tx, context, record.employeeId, 'attendance.read.all');
      assertValidMissingCheckOut(
        record.punches,
        checkOut,
        new Date(),
        await nextPunchAfterOpenCheckIn(tx, record),
      );
      const pending = await tx.attendanceCorrection.findMany({
        where: { attendanceRecordId: record.id, status: 'PENDING' },
        select: { afterSnapshot: true },
      });
      if (pending.some((correction) => missingCheckOutFrom(correction.afterSnapshot)))
        throw new ConflictError('A missing check-out for this day is already awaiting a decision');
      return this.createCorrection(tx, context, record, input.reason, {
        ...(jsonSnapshot(record) as Record<string, unknown>),
        [MISSING_CHECK_OUT_KEY]: { occurredAt: checkOut.toISOString() },
      });
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
        // A missing-check-out correction adds the day's OUT punch; the totals are then taken from
        // the punches as they now stand. Every other correction keeps the moved-punch path.
        const withAddedCheckOut = await this.addMissingCheckOut(
          tx,
          context,
          correction,
          approverUserId,
        );
        const correctedPunches =
          withAddedCheckOut ??
          correction.attendanceRecord.punches.map((punch) => ({
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

  /**
   * Routes a correction through the organization's approval policy and records it.
   *
   * Shared by the general correction and the missing-check-out one, so both resolve the same
   * policy and approvers and write the same audit event.
   */
  private async createCorrection(
    tx: Prisma.TransactionClient,
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
    await this.audit.record(
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

  /**
   * Adds the check-out a missing-check-out correction asks for, on its final approval.
   *
   * Returns the day's punches including the new one, or undefined when this is not such a
   * correction. Honoured only for a correction raised by a person in the application; one raised by
   * a federation client is left to the moved-punch path exactly as before.
   *
   * The record is locked and every check repeated against its punches as they are now, so a second
   * approval, an administrator's punch, or an earlier correction cannot produce a second check-out.
   */
  private async addMissingCheckOut(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    correction: {
      id: string;
      attendanceRecordId: string;
      requestedByClientId: string | null;
      afterSnapshot: unknown;
      attendanceRecord: { employeeId: string };
    },
    approverUserId: string,
  ): Promise<PunchLike[] | undefined> {
    if (correction.requestedByClientId) return undefined;
    const checkOut = missingCheckOutFrom(correction.afterSnapshot);
    if (!checkOut) return undefined;
    await tx.$queryRaw`SELECT id FROM attendance_records WHERE id = ${correction.attendanceRecordId}::uuid FOR UPDATE`;
    const punches = await tx.attendancePunch.findMany({
      where: {
        attendanceRecordId: correction.attendanceRecordId,
        organizationId: context.organizationId,
      },
      orderBy: { occurredAt: 'asc' },
      select: { punchType: true, occurredAt: true },
    });
    const employeeId = correction.attendanceRecord.employeeId;
    assertValidMissingCheckOut(
      punches,
      checkOut,
      new Date(),
      await nextPunchAfterOpenCheckIn(tx, {
        id: correction.attendanceRecordId,
        organizationId: context.organizationId,
        employeeId,
        punches,
      }),
    );
    await tx.attendancePunch.create({
      data: {
        organizationId: context.organizationId,
        attendanceRecordId: correction.attendanceRecordId,
        employeeId,
        punchType: AttendancePunchType.OUT,
        occurredAt: checkOut,
        source: AttendancePunchSource.ADMIN_CORRECTION,
        capturedByUserId: approverUserId,
        metadata: { captureMode: 'CORRECTION', attendanceCorrectionId: correction.id },
      },
    });
    return [...punches, { punchType: AttendancePunchType.OUT, occurredAt: checkOut }];
  }
}
