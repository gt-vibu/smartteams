import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { AttendanceStatus } from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { canApprove } from '../approvals/approval-authorization';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { canActForAllEmployees, assertMayActForEmployee } from '../employees/employee-scope';
import { findSelfEmployeeId } from '../employees/employee-access';
import type { OutboxService } from '../federation/outbox.service';
import { cancelHolidaySelection } from '../holidays/employee-holiday-cancellation';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { loadHolidayConflicts } from './attendance-holiday-conflict';

export type HolidayReviewOutcome = 'KEEP_HOLIDAY' | 'CONVERT_TO_WORKING_DAY';

const REVIEW_ENTITY = 'ATTENDANCE_HOLIDAY_REVIEW';

/** Records whose review a person decides on, with what the decision needs to be authorised. */
const reviewInclude = {
  holiday: { select: { id: true, name: true, holidayDate: true, isActive: true } },
  selection: true,
  attendanceRecord: {
    include: { employee: { include: { manager: { select: { userId: true } } } } },
  },
} as const;

/**
 * The review of a check-in on a granted optional holiday.
 *
 * The employee explains why they checked in; a manager or administrator then decides whether the
 * day stays a holiday or becomes a working day. See `attendance-holiday-conflict.ts` for the states.
 *
 * Native only. The punch path, which federation also calls, is untouched: a check-in on a holiday
 * is accepted exactly as before, and this workflow is layered on top of the record it produced.
 */
@Injectable()
export class AttendanceHolidayReviewService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Conflicts over a date range. A self-service caller sees only their own. */
  async listConflicts(
    context: DomainContext,
    filters: { employeeId?: string; from: string; to: string },
  ) {
    requirePermission(context, 'attendance.read');
    return this.database.run(context, async (tx) => {
      let employeeId = filters.employeeId;
      if (!canActForAllEmployees(context, 'attendance.read.all')) {
        const self = await findSelfEmployeeId(tx, context);
        if (!self) return { conflicts: [] };
        // Reads refuse with 409, the same as the attendance list itself.
        if (employeeId && employeeId !== self)
          throw new ConflictError('Employees may only read their own attendance records');
        employeeId = self;
      }
      const conflicts = await loadHolidayConflicts(tx, context.organizationId, {
        ...(employeeId ? { employeeId } : {}),
        ...(context.branchId ? { branchId: context.branchId } : {}),
        from: new Date(filters.from),
        to: new Date(filters.to),
      });
      return { conflicts };
    });
  }

  /** The conflict on one record, if it has one — attached to the native check-in reply. */
  async conflictForRecord(context: DomainContext, attendanceId: string) {
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: { id: attendanceId, organizationId: context.organizationId },
        select: { employeeId: true, workDate: true },
      });
      if (!record) return null;
      const [conflict] = await loadHolidayConflicts(tx, context.organizationId, {
        employeeId: record.employeeId,
        from: record.workDate,
        to: record.workDate,
        recordId: attendanceId,
      });
      return conflict ?? null;
    });
  }

  /** The employee's explanation of a check-in on their optional holiday. */
  async requestReview(
    context: DomainContext,
    attendanceId: string,
    input: { reason: string; comment?: string },
  ) {
    requirePermission(context, 'attendance.corrections.write');
    const reason = input.reason.trim();
    if (!reason) throw new ConflictError('A reason for working on the holiday is required');
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: {
          id: attendanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        select: { id: true, employeeId: true, workDate: true },
      });
      // Another tenant's record, or a forged id, is simply not found.
      if (!record) throw new NotFoundError('Attendance record');
      await assertMayActForEmployee(tx, context, record.employeeId, 'attendance.read.all');
      await tx.$queryRaw`SELECT id FROM attendance_records WHERE id = ${record.id}::uuid FOR UPDATE`;
      const [conflict] = await loadHolidayConflicts(tx, context.organizationId, {
        employeeId: record.employeeId,
        from: record.workDate,
        to: record.workDate,
        recordId: record.id,
      });
      if (!conflict || conflict.state === 'CONVERTED_TO_WORKING_DAY')
        throw new ConflictError('This day has no approved optional holiday to review');
      if (conflict.state === 'AWAITING_DECISION')
        throw new ConflictError('This day is already awaiting a manager decision');
      if (conflict.state === 'HOLIDAY_KEPT')
        throw new ConflictError('A manager has already kept the holiday for this day');
      // The partial unique index on pending reviews is the backstop if two requests race past
      // the check above; the second fails as a conflict rather than creating a duplicate.
      const review = await tx.attendanceHolidayReview.create({
        data: {
          organizationId: context.organizationId,
          employeeId: record.employeeId,
          attendanceRecordId: record.id,
          holidayId: conflict.holiday.id,
          selectionId: conflict.selectionId,
          reason,
          comment: input.comment?.trim() || null,
          requestedByUserId: context.actor.userId ?? null,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: REVIEW_ENTITY,
          entityId: review.id,
          action: 'ATTENDANCE_HOLIDAY_REVIEW_REQUESTED',
          afterState: jsonSnapshot(review),
          reason,
        },
        tx,
      );
      return review;
    });
  }

  /** Pending reviews the caller may decide. */
  async listInbox(context: DomainContext) {
    requirePermission(context, 'attendance.corrections.decide');
    const userId = context.actor.userId;
    if (!userId) return { reviews: [] };
    return this.database.run(context, async (tx) => {
      const steps = await this.policySteps(tx, context.organizationId);
      // With no policy nobody can decide, so nothing is waiting for this caller.
      if (!steps) return { reviews: [] };
      const pending = await tx.attendanceHolidayReview.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'PENDING',
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          ...reviewInclude,
          attendanceRecord: {
            include: {
              employee: {
                include: { manager: { select: { userId: true } } },
              },
              punches: {
                orderBy: { occurredAt: 'asc' },
                select: { punchType: true, occurredAt: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const reviews = [];
      for (const review of pending) {
        if (!(await this.mayDecide(tx, context, userId, steps, review))) continue;
        const { employee, punches } = review.attendanceRecord;
        reviews.push({
          id: review.id,
          attendanceId: review.attendanceRecordId,
          workDate: review.attendanceRecord.workDate.toISOString().slice(0, 10),
          holiday: {
            id: review.holiday.id,
            name: review.holiday.name,
            date: review.holiday.holidayDate.toISOString().slice(0, 10),
          },
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeNumber: employee.employeeNumber,
          },
          reason: review.reason,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
          attendance: {
            status: review.attendanceRecord.status,
            workedMinutes: review.attendanceRecord.workedMinutes,
            overtimeMinutes: review.attendanceRecord.overtimeMinutes,
            punches: punches.map((punch) => ({
              type: punch.punchType,
              occurredAt: punch.occurredAt.toISOString(),
            })),
          },
        });
      }
      return { reviews };
    });
  }

  /**
   * A manager's decision: keep the holiday, or convert the day to a working day.
   *
   * One decision settles the review, whatever the number of steps in the correction policy it is
   * authorised against — see `mayDecide`.
   */
  async decide(
    context: DomainContext,
    reviewId: string,
    input: { outcome: HolidayReviewOutcome; comment: string },
  ) {
    requirePermission(context, 'attendance.corrections.decide');
    const comment = input.comment.trim();
    if (!comment) throw new ConflictError('A decision reason is required');
    const userId = context.actor.userId;
    if (!userId) throw new ConflictError('A human approver is required');
    return this.database.run(context, async (tx) => {
      // Lock first, read second: a second manager deciding at the same moment waits here and then
      // finds the review already decided.
      await tx.$queryRaw`SELECT id FROM attendance_holiday_reviews WHERE id = ${reviewId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const review = await tx.attendanceHolidayReview.findFirst({
        where: {
          id: reviewId,
          organizationId: context.organizationId,
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: reviewInclude,
      });
      if (!review) throw new NotFoundError('Holiday review');
      if (review.status !== 'PENDING') throw new ConflictError('This review is already decided');
      const steps = await this.policySteps(tx, context.organizationId);
      if (!steps)
        throw new ConflictError(
          'Configure a default attendance correction approval policy before deciding holiday reviews',
        );
      if (!(await this.mayDecide(tx, context, userId, steps, review)))
        throw new ForbiddenDomainError('The current user may not decide this review');
      await tx.$queryRaw`SELECT id FROM attendance_records WHERE id = ${review.attendanceRecordId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM employee_holiday_selections WHERE id = ${review.selectionId}::uuid FOR UPDATE`;
      const record = await tx.attendanceRecord.findUniqueOrThrow({
        where: { id: review.attendanceRecordId },
      });
      const selection = await tx.employeeHolidaySelection.findUniqueOrThrow({
        where: { id: review.selectionId },
      });
      const decidedAt = new Date();

      // The holiday was cancelled, or withdrawn, while the review waited: there is no longer a
      // conflict to decide. The review is closed as such rather than applied to a changed day.
      if (selection.status !== 'CONFIRMED' || !review.holiday.isActive) {
        const closed = await tx.attendanceHolidayReview.update({
          where: { id: review.id },
          data: {
            status: 'CANCELLED',
            decidedByUserId: userId,
            decisionComment: comment,
            decidedAt,
          },
        });
        await this.recordDecision(context, tx, review, closed, record, record, comment);
        return { review: closed, result: 'NO_LONGER_IN_CONFLICT' as const };
      }

      let recordAfter = record;
      if (input.outcome === 'KEEP_HOLIDAY') {
        // The punches stay as history; the day counts no worked time, so neither the timesheet
        // derived from it nor overtime pay counts the holiday as worked.
        recordAfter = await tx.attendanceRecord.update({
          where: { id: record.id },
          data: {
            status: AttendanceStatus.REJECTED,
            workedMinutes: 0,
            overtimeMinutes: 0,
            correctionNote: `Optional holiday kept (${review.holiday.name}); check-in retained as history`,
            version: { increment: 1 },
          },
        });
      } else {
        // The existing cancellation: same status change, audit entry and event as an employee
        // cancelling their own selection. Attendance is left exactly as recorded.
        await cancelHolidaySelection(
          tx,
          this.audit,
          this.outbox,
          context,
          selection,
          `Converted to a working day: ${comment}`,
        );
      }
      const decided = await tx.attendanceHolidayReview.update({
        where: { id: review.id },
        data: {
          status: 'APPROVED',
          outcome: input.outcome,
          decidedByUserId: userId,
          decisionComment: comment,
          decidedAt,
        },
      });
      const markedStale = await markPayrollStale(
        tx,
        context.organizationId,
        record.workDate,
        record.workDate,
      );
      // markPayrollStale touches only CALCULATED runs. A run already approved or released over
      // this date is not recalculated here — released pay changes only through the payroll
      // correction workflow — so the caller is told which runs those are, to say so.
      const finalizedRuns = await tx.payrollRun.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['APPROVED', 'RELEASED', 'LOCKED'] },
          periodStart: { lte: record.workDate },
          periodEnd: { gte: record.workDate },
        },
        select: { id: true, status: true },
      });
      await this.recordDecision(context, tx, review, decided, record, recordAfter, comment);
      return { review: decided, result: input.outcome, payroll: { markedStale, finalizedRuns } };
    });
  }

  private async recordDecision(
    context: DomainContext,
    tx: Prisma.TransactionClient,
    before: object,
    after: { status: string; outcome: string | null },
    recordBefore: object,
    recordAfter: object,
    comment: string,
  ) {
    const action =
      after.status === 'CANCELLED'
        ? 'ATTENDANCE_HOLIDAY_REVIEW_CLOSED'
        : after.outcome === 'KEEP_HOLIDAY'
          ? 'ATTENDANCE_HOLIDAY_REVIEW_HOLIDAY_KEPT'
          : 'ATTENDANCE_HOLIDAY_REVIEW_CONVERTED';
    await this.audit.record(
      context,
      {
        entityType: REVIEW_ENTITY,
        entityId: (before as { id: string }).id,
        action,
        beforeState: jsonSnapshot({ review: before, attendanceRecord: recordBefore }),
        afterState: jsonSnapshot({ review: after, attendanceRecord: recordAfter }),
        reason: comment,
      },
      tx,
    );
  }

  /**
   * The steps of the organization's attendance-correction policy. A holiday check-in is decided by
   * the same people who decide attendance corrections; there is no separate policy for it.
   */
  private async policySteps(tx: Prisma.TransactionClient, organizationId: string) {
    const policies = await tx.approvalPolicy.findMany({
      where: { organizationId, domain: 'ATTENDANCE_CORRECTION', isActive: true },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const policy =
      policies.find((candidate) => candidate.isDefault) ??
      (policies.length === 1 ? policies[0] : undefined);
    return policy?.steps ?? null;
  }

  /**
   * Whether this user may decide this review: they must be an approver on some step of the
   * correction policy for the employee's day, and neither the employee nor whoever raised it.
   */
  private async mayDecide(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    userId: string,
    steps: NonNullable<Awaited<ReturnType<AttendanceHolidayReviewService['policySteps']>>>,
    review: {
      requestedByUserId: string | null;
      attendanceRecord: {
        branchId: string | null;
        employee: { userId: string | null; manager: { userId: string | null } | null };
      };
    },
  ) {
    const { employee, branchId } = review.attendanceRecord;
    if (employee.userId === userId || review.requestedByUserId === userId) return false;
    for (const step of steps) {
      if (
        await canApprove(
          tx,
          context.organizationId,
          userId,
          employee.manager?.userId,
          step.approverType,
          step.roleId,
          step.approverUserId,
          branchId ?? context.branchId,
          employee.userId,
        )
      )
        return true;
    }
    return false;
  }
}
