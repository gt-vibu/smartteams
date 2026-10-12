import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { AttendanceDayStatus, AttendanceStatus } from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { systemApprovalContext } from '../approvals/approval-automation';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertMayActForEmployee } from '../employees/employee-scope';
import { WorkingDayService } from '../shifts/working-day.service';
import { createAttendanceCorrection } from './attendance-correction-create';
import { attendanceDate, nextPunchAfterOpenCheckIn } from './attendance-corrections-helpers';
import { AttendanceDecisionsService } from './attendance-decisions.service';
import { ForbiddenDomainError } from '../../common/errors/domain-error';
import {
  missedCheckOutDeadline,
  readMissedCheckOutPolicy,
} from './attendance-missed-checkout-policy';
import {
  assertValidMissingCheckOut,
  MISSING_CHECK_OUT_KEY,
  missingCheckOutFrom,
} from './attendance-missing-checkout';
import { snapshotDate, snapshotRecord } from './attendance-shared';

/**
 * Raising a correction request and deciding on it.
 *
 * The two operations that change something: an employee disputes a record, an approver accepts or
 * rejects the dispute. Both rewrite the underlying attendance record through the same path, which
 * is why they belong together and the lists that merely display them do not.
 */
@Injectable()
export class AttendanceCorrectionsService {
  private readonly workingDays: WorkingDayService;
  private readonly decisions: AttendanceDecisionsService;

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {
    this.workingDays = new WorkingDayService(database);
    this.decisions = new AttendanceDecisionsService(database, audit);
  }

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
      return createAttendanceCorrection(
        tx,
        this.audit,
        context,
        record,
        input.reason,
        input.afterSnapshot ?? record,
        (id, reason) =>
          this.decisions.decideInTransaction(
            tx,
            systemApprovalContext(context),
            id,
            'APPROVED',
            reason,
          ),
      );
    });
  }

  /** Creates a correction for a day that does not yet have an attendance row. */
  async requestCorrectionForDate(
    context: DomainContext,
    employeeId: string,
    workDate: string,
    input: { reason: string; afterSnapshot?: Record<string, unknown> },
  ) {
    requirePermission(context, 'attendance.corrections.write');
    requireReason({ ...context, reason: input.reason }, 'Attendance correction requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId, status: 'ACTIVE' },
        include: { manager: { select: { userId: true } } },
      });
      if (!employee) throw new NotFoundError('Active employee');
      const branchId = context.branchId ?? employee.primaryBranchId;
      if (!branchId)
        throw new ConflictError('An outlet is required to resolve attendance approvers');

      const date = attendanceDate(workDate);
      const afterSnapshot = snapshotRecord(input.afterSnapshot);
      const correctedCheckIn = snapshotDate(afterSnapshot?.correctedCheckIn, 'check-in');
      const correctedCheckOut = snapshotDate(afterSnapshot?.correctedCheckOut, 'check-out');
      if (!correctedCheckIn)
        throw new ConflictError('An attendance request requires a check-in time');
      if (correctedCheckOut && correctedCheckOut < correctedCheckIn)
        throw new ConflictError('Attendance check-out must be after check-in');

      // Check working day evaluation
      const dayEval = await this.workingDays.evaluateDay(
        tx,
        context.organizationId,
        employeeId,
        date,
      );
      if (dayEval.reason === 'BEFORE_JOINING' || dayEval.reason === 'AFTER_LEAVING') {
        throw new ConflictError(
          dayEval.detail ?? 'Attendance cannot be requested outside employment period',
        );
      }
      if (!dayEval.isWorkingDay && (!input.reason || input.reason.trim().length < 10)) {
        throw new ConflictError(
          'Regularization on a non-working day requires a descriptive reason (minimum 10 characters)',
        );
      }

      const record = await tx.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId, workDate: date } },
        create: {
          organizationId: context.organizationId,
          employeeId,
          branchId,
          workDate: date,
          status: AttendanceStatus.OPEN,
          dayStatus: AttendanceDayStatus.ABSENT,
          sourceAccessMode: context.accessMode,
        },
        update: { branchId, sourceAccessMode: context.accessMode },
        include: {
          punches: true,
          employee: { include: { manager: { select: { userId: true } } } },
        },
      });
      const pending = await tx.attendanceCorrection.findFirst({
        where: {
          organizationId: context.organizationId,
          attendanceRecordId: record.id,
          status: 'PENDING',
        },
        select: { id: true },
      });
      if (pending)
        throw new ConflictError(
          'An attendance correction is already awaiting approval for this date',
        );
      if (record.punches.length > 0)
        throw new ConflictError(
          'This date already has attendance punches. Submit a correction for the recorded attendance instead.',
        );

      return createAttendanceCorrection(
        tx,
        this.audit,
        context,
        record,
        input.reason,
        {
          ...afterSnapshot,
          correctedCheckIn: correctedCheckIn.toISOString(),
          ...(correctedCheckOut ? { correctedCheckOut: correctedCheckOut.toISOString() } : {}),
          dayStatus: AttendanceDayStatus.PRESENT,
          // Distinguishes a regularization that creates the day's first punches from an edit
          // to punches that already existed when the request was submitted.
          missingAttendanceDay: true,
          isNonWorkingDay: !dayEval.isWorkingDay,
          nonWorkingDayReason: dayEval.reason,
          nonWorkingDayDetail: dayEval.detail,
        },
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
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: {
          metadata: true,
          autoCheckOutMode: true,
          autoCheckOutAt: true,
          payrollDayOfMonth: true,
        },
      });
      const missedPolicy = readMissedCheckOutPolicy(
        settings.metadata,
        settings.autoCheckOutMode,
        settings.autoCheckOutAt,
        record.workDate.toISOString().slice(0, 10),
      );
      if (
        record.employee.userId === context.actor.userId &&
        !missedPolicy.employeeCorrectionsAllowed
      )
        throw new ForbiddenDomainError(
          'Employee correction requests are disabled by attendance policy',
        );
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
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { timezone: true },
      });
      const deadline = missedCheckOutDeadline(
        record.workDate.toISOString().slice(0, 10),
        organization.timezone,
        missedPolicy,
        settings.payrollDayOfMonth,
      );
      return createAttendanceCorrection(tx, this.audit, context, record, input.reason, {
        ...(jsonSnapshot(record) as Record<string, unknown>),
        [MISSING_CHECK_OUT_KEY]: {
          occurredAt: checkOut.toISOString(),
          policyVersion: missedPolicy.version,
          ...(new Date() > deadline ? { submittedAfterDeadline: true } : {}),
        },
      });
    });
  }

  /**
   * Decides a correction.
   *
   * `checkOutAt` lets the approver accept a proposed check-out at a different time — the day an
   * automatic close proposed midnight for and the employee actually left at 18:07. It is native
   * only: a federation client never sends it, and a correction a federation client raised does not
   * accept it, so that path decides exactly as it always has. The replacement is re-checked
   * against the day's punches like any other, and the correction records the time that was
   * actually applied.
   */
  decideCorrection(...args: Parameters<AttendanceDecisionsService['decideCorrection']>) {
    return this.decisions.decideCorrection(...args);
  }
}
