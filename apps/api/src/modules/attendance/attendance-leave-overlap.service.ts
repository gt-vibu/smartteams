import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { Prisma } from '../../generated/prisma/client';
import {
  AttendanceDayStatus,
  AttendanceStatus,
  LeaveBalanceTransactionType,
} from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { notify } from '../notifications/notify';
import { markPayrollStale } from '../payroll/payroll-staleness';

const ENTITY = 'ATTENDANCE_LEAVE_OVERLAP_REVIEW';
const AUTO_APPROVE_KEY = 'attendanceLeaveOverlapAutoApprove';

@Injectable()
export class AttendanceLeaveOverlapService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Called only by the native punch facade. Federation attendance is deliberately untouched. */
  async afterNativePunch(
    context: DomainContext,
    attendanceRecordId: string,
    punchType: 'IN' | 'OUT',
  ) {
    if (context.accessMode !== 'NATIVE') return;
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: { id: attendanceRecordId, organizationId: context.organizationId },
        include: {
          employee: { select: { id: true, userId: true, firstName: true, lastName: true } },
          punches: true,
        },
      });
      if (!record) return;
      const key = record.workDate.toISOString().slice(0, 10);
      const leaves = await tx.leaveRequest.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: record.employeeId,
          status: 'APPROVED',
          startDate: { lte: record.workDate },
          endDate: { gte: record.workDate },
        },
        include: { leaveType: { select: { id: true, name: true, paid: true } } },
      });
      const applicable = leaves.filter(
        (leave) => !Array.isArray(leave.chargedDates) || leave.chargedDates.includes(key),
      );
      if (!applicable.length) return;

      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { metadata: true },
      });
      const metadata =
        settings?.metadata &&
        typeof settings.metadata === 'object' &&
        !Array.isArray(settings.metadata)
          ? (settings.metadata as Record<string, unknown>)
          : {};
      const autoApprove = metadata[AUTO_APPROVE_KEY] === true;
      const requesterId = context.actor.userId ?? null;

      for (const leave of applicable) {
        const units = leave.session !== 'FULL_DAY' ? 0.5 : 1;
        const existing = await tx.attendanceLeaveOverlapReview.findUnique({
          where: {
            attendanceRecordId_leaveRequestId: {
              attendanceRecordId: record.id,
              leaveRequestId: leave.id,
            },
          },
        });
        const review = await tx.attendanceLeaveOverlapReview.upsert({
          where: {
            attendanceRecordId_leaveRequestId: {
              attendanceRecordId: record.id,
              leaveRequestId: leave.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            employeeId: record.employeeId,
            attendanceRecordId: record.id,
            leaveRequestId: leave.id,
            workDate: record.workDate,
            leaveUnits: new Prisma.Decimal(units),
            requestedByUserId: requesterId,
          },
          update: {},
        });
        if (review.status === 'PENDING' && record.dayStatus !== AttendanceDayStatus.ON_LEAVE) {
          await tx.attendanceRecord.update({
            where: { id: record.id },
            data: { dayStatus: AttendanceDayStatus.ON_LEAVE, version: { increment: 1 } },
          });
        }

        // Automatic approval is deliberately applied only after a check-out closes the session.
        if (autoApprove && punchType === 'OUT' && review.status === 'PENDING') {
          await this.applyDecision(tx, context, review, record, leave, 'APPROVED', null, true);
          await markPayrollStale(tx, context.organizationId, record.workDate, record.workDate);
          continue;
        }
        if (review.status !== 'PENDING' || punchType !== 'IN' || existing || autoApprove) continue;

        const subjectIsHr = record.employee.userId
          ? await this.userHasRole(tx, context.organizationId, record.employee.userId, 'HR_ADMIN')
          : false;
        const targetRoles = subjectIsHr ? ['ORG_ADMIN'] : ['ORG_ADMIN', 'HR_ADMIN'];
        const recipients = await tx.userRole.findMany({
          where: {
            organizationId: context.organizationId,
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            role: { code: { in: targetRoles } },
            user: { isActive: true },
          },
          select: { userId: true },
        });
        await notify(tx, context, {
          recipients: recipients.map((item) => item.userId),
          kind: 'ATTENDANCE_LEAVE_OVERLAP_PENDING',
          title: subjectIsHr ? 'HR leave overlap needs admin review' : 'Leave overlap needs review',
          body: `${record.employee.firstName} ${record.employee.lastName} has attendance on approved leave for ${key}. Review the worked day before payroll.`,
          module: 'approvals',
          entityType: ENTITY,
          entityId: review.id,
        });
      }
    });
  }

  async inbox(context: DomainContext) {
    requirePermission(context, 'attendance.read.all');
    requirePermission(context, 'attendance.corrections.decide');
    const userId = context.actor.userId;
    if (!userId) return { reviews: [] };
    return this.database.run(context, async (tx) => {
      const actorRoles = await this.roleCodes(tx, context.organizationId, userId);
      const isAdmin = actorRoles.has('ORG_ADMIN');
      const isHr = actorRoles.has('HR_ADMIN');
      if (!isAdmin && !isHr) return { reviews: [] };
      await this.ensureExistingOverlapsAreReviewable(tx, context);
      const rows = await tx.attendanceLeaveOverlapReview.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'PENDING',
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          employee: {
            select: {
              id: true,
              userId: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
          leaveRequest: { include: { leaveType: { select: { name: true, paid: true } } } },
          attendanceRecord: {
            include: {
              punches: {
                orderBy: { occurredAt: 'asc' },
                select: { punchType: true, occurredAt: true },
              },
            },
          },
        },
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      });
      const visible: typeof rows = [];
      for (const row of rows) {
        if (row.employee.userId === userId) continue;
        const subjectIsHr = row.employee.userId
          ? await this.userHasRole(tx, context.organizationId, row.employee.userId, 'HR_ADMIN')
          : false;
        if (subjectIsHr && !isAdmin) continue;
        visible.push(row);
      }
      return {
        reviews: visible.map((row) => ({
          id: row.id,
          attendanceId: row.attendanceRecordId,
          workDate: row.workDate.toISOString().slice(0, 10),
          leaveType: row.leaveRequest.leaveType.name,
          leavePaid: row.leaveRequest.leaveType.paid,
          leaveUnits: Number(row.leaveUnits),
          employee: {
            id: row.employee.id,
            firstName: row.employee.firstName,
            lastName: row.employee.lastName,
            employeeNumber: row.employee.employeeNumber,
          },
          status: row.attendanceRecord.status,
          workedMinutes: row.attendanceRecord.workedMinutes,
          punches: row.attendanceRecord.punches.map((punch) => ({
            type: punch.punchType,
            occurredAt: punch.occurredAt.toISOString(),
          })),
          createdAt: row.createdAt.toISOString(),
        })),
      };
    });
  }

  /** Recover native punches recorded before this review table was available. */
  private async ensureExistingOverlapsAreReviewable(
    tx: Prisma.TransactionClient,
    context: DomainContext,
  ) {
    const from = new Date(Date.now() - 120 * 86_400_000);
    const records = await tx.attendanceRecord.findMany({
      where: {
        organizationId: context.organizationId,
        sourceAccessMode: 'NATIVE',
        status: { in: [AttendanceStatus.OPEN, AttendanceStatus.COMPLETED] },
        dayStatus: AttendanceDayStatus.ON_LEAVE,
        workDate: { gte: from, lte: new Date() },
        punches: { some: { punchType: 'IN' } },
        leaveOverlapReviews: { none: {} },
        ...(context.branchId ? { branchId: context.branchId } : {}),
      },
      select: { id: true, employeeId: true, workDate: true },
      orderBy: { workDate: 'desc' },
      take: 500,
    });
    if (records.length === 0) return;

    const leaves = await tx.leaveRequest.findMany({
      where: {
        organizationId: context.organizationId,
        employeeId: { in: [...new Set(records.map((record) => record.employeeId))] },
        status: 'APPROVED',
        startDate: { lte: records[0]!.workDate },
        endDate: { gte: records[records.length - 1]!.workDate },
      },
      select: {
        id: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        session: true,
        chargedDates: true,
      },
    });
    for (const record of records) {
      const date = record.workDate.toISOString().slice(0, 10);
      for (const leave of leaves) {
        if (
          leave.employeeId !== record.employeeId ||
          leave.startDate > record.workDate ||
          leave.endDate < record.workDate ||
          (Array.isArray(leave.chargedDates) && !leave.chargedDates.includes(date))
        )
          continue;
        await tx.attendanceLeaveOverlapReview.upsert({
          where: {
            attendanceRecordId_leaveRequestId: {
              attendanceRecordId: record.id,
              leaveRequestId: leave.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            employeeId: record.employeeId,
            attendanceRecordId: record.id,
            leaveRequestId: leave.id,
            workDate: record.workDate,
            leaveUnits: new Prisma.Decimal(leave.session !== 'FULL_DAY' ? 0.5 : 1),
          },
          update: {},
        });
      }
    }
  }

  async decide(
    context: DomainContext,
    id: string,
    input: { status: 'APPROVED' | 'REJECTED'; comment?: string },
  ) {
    requirePermission(context, 'attendance.read.all');
    requirePermission(context, 'attendance.corrections.decide');
    const userId = context.actor.userId;
    if (!userId) throw new ConflictError('A signed-in reviewer is required');
    const comment =
      input.comment?.trim() ||
      (input.status === 'APPROVED'
        ? 'Accepted by authorized reviewer.'
        : 'Rejected by authorized reviewer.');
    return this.database.run(context, async (tx) => {
      await tx.$queryRaw`SELECT id FROM attendance_leave_overlap_reviews WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const review = await tx.attendanceLeaveOverlapReview.findFirst({
        where: {
          id,
          organizationId: context.organizationId,
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          employee: { select: { userId: true } },
          leaveRequest: { include: { leaveType: { select: { paid: true } } } },
          attendanceRecord: { include: { punches: { orderBy: { occurredAt: 'asc' } } } },
        },
      });
      if (!review) throw new NotFoundError('Leave overlap review');
      if (review.status !== 'PENDING')
        throw new ConflictError('This overlap has already been reviewed.');
      const actorRoles = await this.roleCodes(tx, context.organizationId, userId);
      const subjectIsHr = review.employee.userId
        ? await this.userHasRole(tx, context.organizationId, review.employee.userId, 'HR_ADMIN')
        : false;
      if (
        review.employee.userId === userId ||
        (!actorRoles.has('ORG_ADMIN') && !actorRoles.has('HR_ADMIN')) ||
        (subjectIsHr && !actorRoles.has('ORG_ADMIN'))
      )
        throw new ForbiddenDomainError(
          subjectIsHr
            ? 'An organization admin must review an HR employee overlap.'
            : 'Only HR or an organization admin may review this overlap.',
        );
      const closed = review.attendanceRecord.punches.at(-1)?.punchType === 'OUT';
      if (input.status === 'APPROVED' && !closed)
        throw new ConflictError('Approve the overlap after the employee has checked out.');
      const result = await this.applyDecision(
        tx,
        context,
        review,
        review.attendanceRecord,
        review.leaveRequest,
        input.status,
        userId,
        false,
        comment,
      );
      return {
        review: result,
        markedStale: await markPayrollStale(
          tx,
          context.organizationId,
          review.workDate,
          review.workDate,
        ),
      };
    });
  }

  async autoApprovalSetting(context: DomainContext) {
    requirePermission(context, 'attendance.preferences.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { metadata: true },
      });
      const metadata =
        settings?.metadata &&
        typeof settings.metadata === 'object' &&
        !Array.isArray(settings.metadata)
          ? (settings.metadata as Record<string, unknown>)
          : {};
      return { enabled: metadata[AUTO_APPROVE_KEY] === true };
    });
  }

  async setAutoApproval(context: DomainContext, enabled: boolean) {
    requirePermission(context, 'approval-policies.write');
    const userId = context.actor.userId;
    if (!userId)
      throw new ForbiddenDomainError(
        'Only an organization admin can configure automatic overlap approval.',
      );
    return this.database.run(context, async (tx) => {
      if (!(await this.userHasRole(tx, context.organizationId, userId, 'ORG_ADMIN')))
        throw new ForbiddenDomainError(
          'Only an organization admin can configure automatic overlap approval.',
        );
      await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const current = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const metadata =
        current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
          ? (current.metadata as Record<string, unknown>)
          : {};
      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: { metadata: jsonSnapshot({ ...metadata, [AUTO_APPROVE_KEY]: enabled }) },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'ATTENDANCE_LEAVE_OVERLAP_AUTO_APPROVAL_UPDATED',
          beforeState: { enabled: metadata[AUTO_APPROVE_KEY] === true },
          afterState: { enabled },
        },
        tx,
      );
      return { enabled: (updated.metadata as Record<string, unknown>)[AUTO_APPROVE_KEY] === true };
    });
  }

  private async applyDecision(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    review: {
      id: string;
      status: string;
      employeeId: string;
      attendanceRecordId: string;
      leaveRequestId: string;
      workDate: Date;
      leaveUnits: Prisma.Decimal;
      autoApproved?: boolean;
    },
    record: {
      id: string;
      status: AttendanceStatus;
      dayStatus: AttendanceDayStatus;
      workedMinutes: number;
      overtimeMinutes: number;
      version: number;
    },
    leave: {
      id: string;
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      endDate: Date;
      leaveType: { paid: boolean };
    },
    status: 'APPROVED' | 'REJECTED',
    reviewer: string | null,
    autoApproved: boolean,
    comment = autoApproved ? 'Automatically approved by organization policy.' : '',
  ) {
    const now = new Date();
    const reviewAfter = await tx.attendanceLeaveOverlapReview.update({
      where: { id: review.id },
      data: {
        status,
        autoApproved,
        decidedByUserId: reviewer,
        decisionComment: comment || null,
        decidedAt: now,
      },
    });
    const recordAfter = await tx.attendanceRecord.update({
      where: { id: record.id },
      data:
        status === 'APPROVED'
          ? {
              dayStatus: AttendanceDayStatus.PRESENT,
              correctionNote: `Approved worked leave overlap ${review.id}`,
              version: { increment: 1 },
            }
          : {
              status: AttendanceStatus.REJECTED,
              dayStatus: AttendanceDayStatus.ON_LEAVE,
              workedMinutes: 0,
              overtimeMinutes: 0,
              correctionNote: `Rejected worked leave overlap ${review.id}`,
              version: { increment: 1 },
            },
    });
    if (status === 'APPROVED' && leave.leaveType.paid) {
      const balance = await tx.leaveBalance.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: leave.employeeId,
          leaveTypeId: leave.leaveTypeId,
          periodStart: { lte: review.workDate },
          periodEnd: { gte: review.workDate },
        },
      });
      if (!balance) throw new NotFoundError('Leave balance for the overlapping date');
      const units = review.leaveUnits;
      const changed = await tx.leaveBalance.updateMany({
        where: { id: balance.id, usedAmount: { gte: units } },
        data: {
          usedAmount: { decrement: units },
          availableAmount: { increment: units },
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictError(
          'The leave balance no longer contains the overlapping leave units. Refresh and review again.',
        );
      await tx.leaveBalanceTransaction.create({
        data: {
          organizationId: context.organizationId,
          leaveBalanceId: balance.id,
          leaveRequestId: leave.id,
          transactionType: LeaveBalanceTransactionType.REVERSAL,
          amount: units,
          reason: `Worked leave overlap approved for ${review.workDate.toISOString().slice(0, 10)}`,
          createdByUserId: reviewer,
        },
      });
    }
    await this.audit.record(
      context,
      {
        entityType: ENTITY,
        entityId: review.id,
        action:
          status === 'APPROVED'
            ? 'ATTENDANCE_LEAVE_OVERLAP_APPROVED'
            : 'ATTENDANCE_LEAVE_OVERLAP_REJECTED',
        beforeState: jsonSnapshot({ review, attendanceRecord: record }),
        afterState: jsonSnapshot({ review: reviewAfter, attendanceRecord: recordAfter }),
        reason: comment,
      },
      tx,
    );
    const employee = await tx.employee.findFirst({
      where: { id: review.employeeId, organizationId: context.organizationId },
      select: { userId: true },
    });
    await notify(tx, context, {
      recipients: [employee?.userId],
      kind:
        status === 'APPROVED'
          ? 'ATTENDANCE_LEAVE_OVERLAP_APPROVED'
          : 'ATTENDANCE_LEAVE_OVERLAP_REJECTED',
      title: status === 'APPROVED' ? 'Leave overlap accepted' : 'Leave overlap rejected',
      body:
        status === 'APPROVED'
          ? `This date is recorded as worked. Payroll will count the day as payable${leave.leaveType.paid ? ' and its paid leave balance has been restored' : ' and it has been removed from unpaid leave deductions'}.`
          : 'This date remains covered by the approved leave and will not count as a worked day.',
      module: 'attendance',
      entityType: ENTITY,
      entityId: review.id,
    });
    return reviewAfter;
  }

  private async userHasRole(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    code: string,
  ) {
    const now = new Date();
    return Boolean(
      await tx.userRole.findFirst({
        where: {
          organizationId,
          userId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          role: { code },
        },
        select: { id: true },
      }),
    );
  }

  private async roleCodes(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
    const now = new Date();
    const roles = await tx.userRole.findMany({
      where: {
        organizationId,
        userId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { role: { select: { code: true } } },
    });
    return new Set(roles.map((item) => item.role.code));
  }
}
