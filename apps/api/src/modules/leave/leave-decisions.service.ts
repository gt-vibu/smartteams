import { requestCancellation } from './leave-workflow-rules';
import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { Prisma } from '../../generated/prisma/client';
import {
  ApproverType,
  LeaveBalanceTransactionType,
  LeaveRequestStatus,
} from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { assertApprover } from '../approvals/approval-authorization';
import { assertOpenPayrollPeriod } from '../approvals/approval-automation';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertMayActForEmployee } from '../employees/employee-scope';
import { describeDays, notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { clearLeaveDaysOnAttendance, markLeaveDaysOnAttendance } from './leave-attendance-sync';
import { ledger, releaseReservation } from './leave-balance-ops';
import { toRequestDto } from './leave-shared';

/**
 * Approving, rejecting and cancelling a leave request.
 *
 * The half of the request lifecycle that changes somebody else's decision rather than making
 * one's own. Both paths release the reservation they inherit and write the ledger, which is why
 * those operations are free functions rather than methods on whichever service got there first.
 */
@Injectable()
export class LeaveDecisionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async decide(
    context: DomainContext,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string | null,
    expectedStepNumber?: number,
  ) {
    requirePermission(context, 'leave.requests.decide');
    const approverUserId = context.actor.userId;
    if (!approverUserId) throw new ConflictError('A human approver is required');
    return this.database.run(context, (tx) =>
      this.decideInTransaction(tx, context, requestId, status, comment, expectedStepNumber),
    );
  }

  async decideInTransaction(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string | null,
    expectedStepNumber?: number,
  ) {
    const automatic = context.actor.type === 'SYSTEM';
    const approverUserId = context.actor.userId;
    if (!automatic) requirePermission(context, 'leave.requests.decide');
    if (automatic && status !== 'APPROVED')
      throw new ConflictError('System decisions may only approve');
    await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${requestId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
    const request = await tx.leaveRequest.findFirst({
      where: {
        id: requestId,
        organizationId: context.organizationId,
        ...(context.branchId ? { branchId: context.branchId } : {}),
      },
      include: {
        approvals: true,
        approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        employee: { include: { manager: { select: { userId: true } } } },
      },
    });
    if (!request) throw new NotFoundError('Leave request');
    if (request.status !== LeaveRequestStatus.PENDING)
      throw new ConflictError('Leave request is not pending');
    const pendingStep = request.approvalPolicy?.steps.find(
      (step) => !request.approvals.some((approval) => approval.stepNumber === step.stepNumber),
    );
    if (!automatic && !pendingStep)
      throw new ConflictError('Leave request has no pending approval step');
    if (expectedStepNumber !== undefined && pendingStep?.stepNumber !== expectedStepNumber)
      throw new ConflictError('This approval stage has already changed. Refresh the request.');
    if (!automatic)
      await assertApprover(
        tx,
        context.organizationId,
        approverUserId!,
        request.employee.manager?.userId,
        pendingStep!.approverType,
        pendingStep!.roleId,
        pendingStep!.approverUserId,
        request.branchId ?? context.branchId,
        request.employee.userId,
      );
    if (status === 'APPROVED' && context.accessMode === 'NATIVE')
      await assertOpenPayrollPeriod(tx, context.organizationId, request.startDate, request.endDate);
    const balance = await tx.leaveBalance.findFirst({
      where: {
        organizationId: context.organizationId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        periodStart: { lte: request.startDate },
        periodEnd: { gte: request.endDate },
      },
    });
    if (!balance) throw new NotFoundError('Leave balance');
    const stepNumber = automatic ? 0 : pendingStep!.stepNumber;
    await tx.leaveApproval.create({
      data: {
        organizationId: context.organizationId,
        leaveRequestId: request.id,
        approverUserId: approverUserId ?? null,
        decisionActor: automatic ? 'SYSTEM' : 'USER',
        approvalPolicyStepId: automatic ? null : pendingStep!.id,
        stepNumber,
        status,
        comment: comment ?? null,
        decidedAt: new Date(),
      },
    });
    const hasMoreSteps =
      !automatic &&
      Boolean(request.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber));
    const finalStatus =
      status === 'REJECTED' || !hasMoreSteps ? status : LeaveRequestStatus.PENDING;
    const updated = await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: finalStatus,
        decidedAt: finalStatus === LeaveRequestStatus.PENDING ? undefined : new Date(),
        version: { increment: 1 },
      },
    });
    const days = Number(request.requestedDays);
    if (status === LeaveRequestStatus.APPROVED) {
      if (!hasMoreSteps) {
        await ledger(tx, context, balance.id, {
          transactionType: LeaveBalanceTransactionType.USAGE,
          amount: new Prisma.Decimal(days),
          reason: `Used by leave request ${request.id}`,
          leaveRequestId: request.id,
        });
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            reservedAmount: { decrement: days },
            usedAmount: { increment: days },
            version: { increment: 1 },
          },
        });
        // Only once the request is finally approved. An intermediate step of a multi-step
        // policy is not yet a decision, and must not put days on the attendance calendar.
        await markLeaveDaysOnAttendance(tx, context, request);
        // Payroll reads approved leave directly, so a run already calculated over these dates
        // is now working from data that has changed underneath it.
        await markPayrollStale(tx, context.organizationId, request.startDate, request.endDate);
      }
    } else {
      await releaseReservation(tx, context, balance.id, request.id, days, 'Leave request rejected');
    }
    await this.audit.record(
      context,
      {
        entityType: 'LEAVE_REQUEST',
        entityId: request.id,
        action: `LEAVE_REQUEST_${status}`,
        beforeState: jsonSnapshot(request),
        afterState: jsonSnapshot(updated),
        reason: comment ?? '',
      },
      tx,
    );
    await this.announceDecision(tx, context, request, finalStatus, stepNumber, comment);
    return toRequestDto(updated, days);
  }

  async cancel(context: DomainContext, requestId: string, reason: string) {
    requirePermission(context, 'leave.requests.write');
    requireReason({ ...context, reason }, 'Leave cancellation requires a reason');
    return this.database.run(context, (tx) =>
      this.cancelInTransaction(tx, context, requestId, reason),
    );
  }

  async cancelInTransaction(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    requestId: string,
    reason: string,
    reviewed = false,
  ) {
    await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${requestId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
    const request = await tx.leaveRequest.findFirst({
      where: {
        id: requestId,
        organizationId: context.organizationId,
        ...(context.branchId ? { branchId: context.branchId } : {}),
      },
    });
    if (
      !request ||
      (request.status !== LeaveRequestStatus.PENDING &&
        request.status !== LeaveRequestStatus.APPROVED)
    )
      throw new ConflictError('Leave request cannot be cancelled');
    // `leave.requests.write` is every employee's permission to raise their own leave. Without
    // this, it also let them cancel a colleague's — an approved one included, which hands the
    // days back and reopens attendance and payroll for that colleague.
    await assertMayActForEmployee(tx, context, request.employeeId, 'leave.requests.read.all');
    if (context.accessMode === 'NATIVE' && request.status === 'APPROVED')
      await assertOpenPayrollPeriod(tx, context.organizationId, request.startDate, request.endDate);
    if (context.accessMode === 'NATIVE' && request.status === 'APPROVED' && !reviewed) {
      const waiting = await requestCancellation(tx, context, request, reason);
      if (waiting) {
        await this.audit.record(
          context,
          {
            entityType: 'LEAVE_REQUEST',
            entityId: request.id,
            action: 'LEAVE_CANCELLATION_REQUESTED',
            beforeState: jsonSnapshot(request),
            afterState: jsonSnapshot(waiting),
            reason,
          },
          tx,
        );
        return toRequestDto(waiting);
      }
    }
    const balance = await tx.leaveBalance.findFirst({
      where: {
        organizationId: context.organizationId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        periodStart: { lte: request.startDate },
        periodEnd: { gte: request.endDate },
      },
    });
    if (!balance) throw new NotFoundError('Leave balance');
    const days = Number(request.requestedDays);
    const updated = await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: LeaveRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (request.status === LeaveRequestStatus.PENDING)
      await releaseReservation(tx, context, balance.id, request.id, days, reason);
    if (request.status === LeaveRequestStatus.APPROVED) {
      await ledger(tx, context, balance.id, {
        transactionType: LeaveBalanceTransactionType.REVERSAL,
        amount: new Prisma.Decimal(days),
        reason,
        leaveRequestId: request.id,
      });
      // The days must return to `availableAmount` as well. Decrementing `usedAmount` alone
      // left the employee with entitlement that was neither used, reserved, nor available —
      // cancelling an approved leave silently destroyed the days it gave back.
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedAmount: { decrement: days },
          availableAmount: { increment: days },
          version: { increment: 1 },
        },
      });
      // The calendar has to give the days back too, or a cancelled leave leaves the employee
      // marked ON_LEAVE for days they are expected to work.
      await clearLeaveDaysOnAttendance(tx, context, request);
      if (request.session && request.session !== 'FULL_DAY') {
        const remaining = await tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId: request.employeeId,
            status: 'APPROVED',
            startDate: { lte: request.endDate },
            endDate: { gte: request.startDate },
            id: { not: request.id },
          },
        });
        for (const leave of remaining) await markLeaveDaysOnAttendance(tx, context, leave);
      }
      await markPayrollStale(tx, context.organizationId, request.startDate, request.endDate);
    }
    await this.audit.record(
      context,
      {
        entityType: 'LEAVE_REQUEST',
        entityId: request.id,
        action: 'LEAVE_REQUEST_CANCELLED',
        beforeState: jsonSnapshot(request),
        afterState: jsonSnapshot(updated),
        reason,
      },
      tx,
    );
    return toRequestDto(updated, days);
  }

  /**
   * The outcome goes to the person who asked; a step passed on goes to whoever decides next. The
   * approver who just decided hears nothing about their own action.
   */
  private async announceDecision(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    request: {
      id: string;
      employeeId: string;
      branchId: string | null;
      startDate: Date;
      endDate: Date;
      approvalPolicy: {
        steps: Array<{
          stepNumber: number;
          approverType: ApproverType;
          roleId: string | null;
          approverUserId: string | null;
        }>;
      } | null;
    },
    finalStatus: string,
    decidedStep: number,
    comment?: string | null,
  ) {
    const requester = await requesterRouting(tx, context.organizationId, request.employeeId);
    const when = describeDays(request.startDate, request.endDate);
    if (finalStatus === LeaveRequestStatus.PENDING) {
      const next = request.approvalPolicy?.steps.find((step) => step.stepNumber > decidedStep);
      if (!next) return;
      await notify(tx, context, {
        recipients: await stepApprovers(
          tx,
          context.organizationId,
          next,
          requester,
          request.branchId,
        ),
        kind: 'LEAVE_PENDING',
        title: 'Leave request awaiting your decision',
        body: `${requester.name}'s leave for ${when} passed the previous approval step.`,
        module: 'approvals',
        entityType: 'LEAVE_REQUEST',
        entityId: request.id,
      });
      return;
    }
    const approved = finalStatus === LeaveRequestStatus.APPROVED;
    await notify(tx, context, {
      recipients: [requester.userId],
      kind: 'LEAVE_DECIDED',
      title: approved ? 'Leave approved' : 'Leave rejected',
      // The approver is told their comment is shown to the requester; this is where it is.
      body: `Your leave for ${when} was ${approved ? 'approved' : 'rejected'}.${
        comment?.trim() ? ` “${comment.trim()}”` : ''
      }`,
      module: 'time-off',
      entityType: 'LEAVE_REQUEST',
      entityId: request.id,
    });
  }
}
