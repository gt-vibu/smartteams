import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import {
  AttendancePunchSource,
  AttendancePunchType,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { assertApprover } from '../approvals/approval-authorization';
import { assertOpenPayrollPeriod } from '../approvals/approval-automation';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { describeDays, notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { markPayrollStale } from '../payroll/payroll-staleness';
import {
  nextPunchAfterOpenCheckIn,
  replaceMissingCheckOut,
} from './attendance-corrections-helpers';
import {
  assertValidMissingCheckOut,
  missingCheckOutFrom,
  type PunchLike,
} from './attendance-missing-checkout';
import {
  attendanceTotals,
  correctionPunchUpdates,
  dayStatusFromSnapshot,
  snapshotDate,
  snapshotRecord,
} from './attendance-shared';
import { expectedDayOn } from './attendance-shift-day';

@Injectable()
export class AttendanceDecisionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}
  async decideCorrection(
    context: DomainContext,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string | null,
    checkOutAt?: string,
    expectedStepNumber?: number,
  ) {
    requirePermission(context, 'attendance.corrections.decide');
    if (status === 'REJECTED') {
      requireReason(
        { ...context, reason: comment ?? undefined },
        'Attendance correction rejections require a comment',
      );
    }
    return this.database.run(context, (tx) =>
      this.decideInTransaction(
        tx,
        context,
        correctionId,
        status,
        comment,
        checkOutAt,
        expectedStepNumber,
      ),
    );
  }

  async decideInTransaction(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string | null,
    checkOutAt?: string,
    expectedStepNumber?: number,
  ) {
    const automatic = context.actor.type === 'SYSTEM';
    if (!automatic) requirePermission(context, 'attendance.corrections.decide');
    if (automatic && status !== 'APPROVED')
      throw new ConflictError('System decisions may only approve');
    await tx.$queryRaw`SELECT id FROM attendance_corrections WHERE id = ${correctionId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
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
    if (expectedStepNumber !== undefined && missingCheckOutFrom(correction.afterSnapshot))
      throw new ConflictError('Missing check-outs require individual review.');
    if (correction.status !== 'PENDING')
      throw new ConflictError('Attendance correction is already decided');
    const approverUserId = context.actor.userId;
    if (!automatic && !approverUserId) throw new ConflictError('A human approver is required');
    const pendingStep = correction.approvalPolicy?.steps.find(
      (step) => !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
    );
    if (!automatic && !pendingStep)
      throw new ConflictError('Attendance correction has no pending approval step');
    if (expectedStepNumber !== undefined && pendingStep?.stepNumber !== expectedStepNumber)
      throw new ConflictError('This approval stage has already changed. Refresh the request.');
    if (!automatic)
      await assertApprover(
        tx,
        context.organizationId,
        approverUserId!,
        correction.attendanceRecord.employee.manager?.userId,
        pendingStep!.approverType,
        pendingStep!.roleId,
        pendingStep!.approverUserId,
        correction.attendanceRecord.branchId ?? context.branchId,
        correction.attendanceRecord.employee.userId,
      );
    if (status === 'APPROVED' && context.accessMode === 'NATIVE')
      await assertOpenPayrollPeriod(
        tx,
        context.organizationId,
        correction.attendanceRecord.workDate,
        correction.attendanceRecord.workDate,
      );
    if (status === 'APPROVED') {
      await tx.$queryRaw`SELECT id FROM attendance_records WHERE id = ${correction.attendanceRecordId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const original = correction.beforeSnapshot as Record<string, unknown> | null;
      if (typeof original?.version === 'number') {
        const current = await tx.attendanceRecord.findFirst({
          where: { id: correction.attendanceRecordId, organizationId: context.organizationId },
          select: { version: true },
        });
        if (current?.version !== original.version)
          throw new ConflictError(
            'Attendance changed after this request was submitted. Reject it and ask the employee to submit a fresh correction.',
          );
      }
    }
    const replacedSnapshot = checkOutAt
      ? replaceMissingCheckOut(correction, checkOutAt)
      : undefined;
    if (replacedSnapshot) correction.afterSnapshot = replacedSnapshot as Prisma.JsonValue;

    const stepNumber = automatic ? 0 : pendingStep!.stepNumber;
    const hasMoreSteps =
      !automatic &&
      Boolean(correction.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber));
    const finalStatus = status === 'REJECTED' || !hasMoreSteps ? status : 'PENDING';
    const updated = await tx.attendanceCorrection.update({
      where: { id: correction.id },
      data: {
        status: finalStatus,
        ...(replacedSnapshot ? { afterSnapshot: jsonSnapshot(replacedSnapshot) } : {}),
        approvals: {
          create: {
            organizationId: context.organizationId,
            approverUserId: approverUserId ?? null,
            decisionActor: automatic ? 'SYSTEM' : 'USER',
            approvalPolicyStepId: automatic ? null : pendingStep!.id,
            status,
            comment: comment ?? null,
            stepNumber,
          },
        },
      },
    });
    let correctedRecord;
    if (status === 'APPROVED' && !hasMoreSteps) {
      const newlyRecordedPunches = await this.addMissingAttendanceDay(
        tx,
        context,
        correction,
        approverUserId ?? null,
      );
      const punchUpdates = newlyRecordedPunches
        ? []
        : correctionPunchUpdates(correction.attendanceRecord.punches, correction.afterSnapshot);
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
        approverUserId ?? null,
      );
      const correctedPunches =
        newlyRecordedPunches ??
        withAddedCheckOut ??
        correction.attendanceRecord.punches.map((punch) => ({
          punchType: punch.punchType,
          occurredAt: updatedTimes.get(punch.id) ?? punch.occurredAt,
        }));
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { standardDayMinutes: true },
      });
      const expected =
        context.accessMode === 'NATIVE'
          ? await expectedDayOn(
              tx,
              context.organizationId,
              correction.attendanceRecord.employeeId,
              correction.attendanceRecord.branchId,
              correction.attendanceRecord.workDate,
              settings.standardDayMinutes,
            )
          : null;
      const totals = attendanceTotals(
        correctedPunches,
        expected?.minutes ?? settings.standardDayMinutes,
      );
      const correctedDayStatus = dayStatusFromSnapshot(correction.afterSnapshot);
      correctedRecord = await tx.attendanceRecord.update({
        where: { id: correction.attendanceRecordId },
        data: {
          status: AttendanceStatus.CORRECTED,
          correctionNote: correction.reason,
          workedMinutes: totals.workedMinutes,
          ...(expected ? { overtimeDayType: expected.dayType } : {}),
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
        reason: comment ?? '',
      },
      tx,
    );
    const record = correction.attendanceRecord;
    const requester = await requesterRouting(tx, context.organizationId, record.employeeId);
    const on = describeDays(record.workDate, record.workDate);
    if (finalStatus === 'PENDING') {
      const next = correction.approvalPolicy?.steps.find((step) => step.stepNumber > stepNumber);
      if (next)
        await notify(tx, context, {
          recipients: await stepApprovers(
            tx,
            context.organizationId,
            next,
            requester,
            record.branchId ?? context.branchId,
          ),
          kind: 'ATTENDANCE_CORRECTION_PENDING',
          title: 'Attendance correction awaiting your decision',
          body: `${requester.name}'s correction for ${on} passed the previous approval step.`,
          module: 'approvals',
          entityType: 'ATTENDANCE_CORRECTION',
          entityId: correction.id,
        });
    } else {
      const approved = finalStatus === 'APPROVED';
      await notify(tx, context, {
        // The employee, and whoever raised it for them if that was someone else.
        recipients: [requester.userId, correction.requestedByUserId],
        kind: 'ATTENDANCE_CORRECTION_DECIDED',
        title: approved ? 'Attendance correction approved' : 'Attendance correction rejected',
        body: `The correction to ${on} was ${approved ? 'approved' : 'rejected'}${comment ? `: ${comment}` : '.'}`,
        module: 'attendance',
        entityType: 'ATTENDANCE_CORRECTION',
        entityId: correction.id,
      });
    }
    return updated;
  }

  /** Creates the IN/OUT punches for an approved regularization of an absent day. */
  private async addMissingAttendanceDay(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    correction: {
      id: string;
      attendanceRecordId: string;
      requestedByClientId: string | null;
      afterSnapshot: unknown;
      attendanceRecord: { employeeId: string; punches: PunchLike[] };
    },
    approverUserId: string | null,
  ): Promise<PunchLike[] | undefined> {
    const snapshot = snapshotRecord(correction.afterSnapshot);
    // Older pending regularizations predate the explicit marker. If the attendance row still has
    // no punches and the request supplies a check-in, it is unambiguously a missing-day request.
    // Treat it the same way so these existing approvals do not hit correctionPunchUpdates(),
    // which correctly rejects moving a check-in that does not exist.
    const isMissingAttendanceDay =
      snapshot?.missingAttendanceDay === true ||
      (correction.attendanceRecord.punches.length === 0 &&
        typeof snapshot?.correctedCheckIn === 'string');
    if (!isMissingAttendanceDay || correction.requestedByClientId) return undefined;
    const checkIn = snapshotDate(snapshot.correctedCheckIn, 'check-in');
    if (!checkIn) throw new ConflictError('Attendance correction requires a check-in time');
    const checkOut = snapshotDate(snapshot.correctedCheckOut, 'check-out');
    if (checkOut && checkOut <= checkIn)
      throw new ConflictError('Attendance check-out must be after check-in');
    if (correction.attendanceRecord.punches.length > 0)
      throw new ConflictError(
        'Attendance punches were added after this request. Reject it and ask for a fresh correction.',
      );

    const punches: PunchLike[] = [
      { punchType: AttendancePunchType.IN, occurredAt: checkIn },
      ...(checkOut ? [{ punchType: AttendancePunchType.OUT, occurredAt: checkOut }] : []),
    ];
    await tx.attendancePunch.createMany({
      data: punches.map((punch) => ({
        organizationId: context.organizationId,
        attendanceRecordId: correction.attendanceRecordId,
        employeeId: correction.attendanceRecord.employeeId,
        punchType: punch.punchType,
        occurredAt: punch.occurredAt,
        source: AttendancePunchSource.ADMIN_CORRECTION,
        capturedByUserId: approverUserId,
        metadata: { captureMode: 'CORRECTION', attendanceCorrectionId: correction.id },
      })),
    });
    return punches;
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
    approverUserId: string | null,
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
