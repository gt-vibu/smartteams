import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import { LeaveRequestStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertApprover } from '../approvals/approval-authorization';
import { assertMayActForEmployee } from '../employees/employee-scope';
import { toRequestDto } from './leave-shared';
import { ledger, releaseReservation } from './leave-balance-ops';
import { clearLeaveDaysOnAttendance, markLeaveDaysOnAttendance } from './leave-attendance-sync';
import { markPayrollStale } from '../payroll/payroll-staleness';

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
    comment: string,
  ) {
    requirePermission(context, 'leave.requests.decide');
    requireReason({ ...context, reason: comment }, 'Leave decisions require a comment');
    const approverUserId = context.actor.userId;
    if (!approverUserId) throw new ConflictError('A human approver is required');
    return this.database.run(context, async (tx) => {
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
      if (!pendingStep) throw new ConflictError('Leave request has no pending approval step');
      await assertApprover(
        tx,
        context.organizationId,
        approverUserId,
        request.employee.manager?.userId,
        pendingStep.approverType,
        pendingStep.roleId,
        pendingStep.approverUserId,
        request.branchId ?? context.branchId,
        request.employee.userId,
      );
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
      const stepNumber = pendingStep.stepNumber;
      await tx.leaveApproval.create({
        data: {
          organizationId: context.organizationId,
          leaveRequestId: request.id,
          approverUserId,
          approvalPolicyStepId: pendingStep.id,
          stepNumber,
          status,
          comment,
          decidedAt: new Date(),
        },
      });
      const hasMoreSteps = Boolean(
        request.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber),
      );
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
        await releaseReservation(
          tx,
          context,
          balance.id,
          request.id,
          days,
          'Leave request rejected',
        );
      }
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_REQUEST',
          entityId: request.id,
          action: `LEAVE_REQUEST_${status}`,
          beforeState: jsonSnapshot(request),
          afterState: jsonSnapshot(updated),
          reason: comment,
        },
        tx,
      );
      return toRequestDto(updated, days);
    });
  }

  async cancel(context: DomainContext, requestId: string, reason: string) {
    requirePermission(context, 'leave.requests.write');
    requireReason({ ...context, reason }, 'Leave cancellation requires a reason');
    return this.database.run(context, async (tx) => {
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
    });
  }
}
