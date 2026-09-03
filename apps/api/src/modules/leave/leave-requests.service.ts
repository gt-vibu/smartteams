import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AccessMode } from '../../generated/prisma/enums';
import { LeaveBalanceTransactionType } from '../../generated/prisma/enums';
import { LeaveRequestStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { assertResolvableApprovers, canApprove } from '../approvals/approval-authorization';
import {
  canReadAllEmployees,
  decodeLeaveCursor,
  dateOnly,
  employeeScope,
  encodeLeaveCursor,
  leavePeriod,
  selfEmployee,
  toRequestDto,
} from './leave-shared';
import { ledger, provisionBalance, workingDays } from './leave-balance-ops';

/**
 * Raising leave requests, and the two lists that show them.
 *
 * Creating a request is the heavy path: it validates the dates against the calendar, reserves
 * against the balance, resolves the approval chain and publishes to the outbox. Deciding on one
 * afterwards is a different concern and lives in `LeaveDecisionsService`.
 */
/** What a caller supplies to raise a leave request. Exported so the controller can name it. */
export type LeaveRequestInput = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  branchId?: string;
  externalId?: string;
  attachmentIds?: string[];
  source: AccessMode;
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listRequests(
    context: DomainContext,
    requestedEmployeeId?: string,
    pagination: { cursor?: string; limit?: number } = {},
  ) {
    requirePermission(context, 'leave.requests.read');
    return this.database.run(context, async (tx) => {
      let employeeId = requestedEmployeeId;
      if (!canReadAllEmployees(context, 'leave.requests.read.all')) {
        const self = await selfEmployee(tx, context);
        if (!self) return { requests: [], nextCursor: undefined };
        if (employeeId && employeeId !== self.id)
          throw new ConflictError('Employees may only read their own leave requests');
        employeeId = self.id;
      }
      const cursorId = pagination.cursor ? decodeLeaveCursor(pagination.cursor) : undefined;
      const limit = Math.min(pagination.limit ?? 100, 500);
      const requests = await tx.leaveRequest.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { employee: { select: { externalId: true } } },
      });
      const hasNextPage = requests.length > limit;
      const page = requests.slice(0, limit);
      return {
        requests: page.map(({ employee, ...request }) => ({
          ...request,
          externalEmployeeId: employee.externalId,
        })),
        nextCursor: hasNextPage ? encodeLeaveCursor(page.at(-1)?.id) : undefined,
      };
    });
  }

  async listPendingApprovals(context: DomainContext, approverUserId: string) {
    requirePermission(context, 'leave.requests.read');
    return this.database.run(context, async (tx) => {
      const requests = await tx.leaveRequest.findMany({
        where: {
          organizationId: context.organizationId,
          status: LeaveRequestStatus.PENDING,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: {
          leaveType: { select: { id: true, code: true, name: true, paid: true } },
          employee: {
            select: {
              id: true,
              externalId: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              userId: true,
              manager: { select: { userId: true } },
            },
          },
          branch: { select: { id: true, code: true, name: true } },
          approvals: true,
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      const items = [];
      for (const request of requests) {
        const pendingStep = request.approvalPolicy?.steps.find(
          (step) => !request.approvals.some((approval) => approval.stepNumber === step.stepNumber),
        );
        if (
          !pendingStep ||
          !(await canApprove(
            tx,
            context.organizationId,
            approverUserId,
            request.employee.manager?.userId,
            pendingStep.approverType,
            pendingStep.roleId,
            pendingStep.approverUserId,
            request.branchId ?? context.branchId,
            request.employee.userId,
          ))
        )
          continue;
        items.push({
          ...toRequestDto(request),
          externalEmployeeId: request.employee.externalId,
          employee: {
            id: request.employee.id,
            externalId: request.employee.externalId,
            employeeNumber: request.employee.employeeNumber,
            firstName: request.employee.firstName,
            lastName: request.employee.lastName,
          },
          branch: request.branch,
          leaveType: request.leaveType,
          reason: request.reason,
          submittedAt: request.submittedAt,
          currentStep: {
            stepNumber: pendingStep.stepNumber,
            approverType: pendingStep.approverType,
            roleId: pendingStep.roleId,
            approverUserId: pendingStep.approverUserId,
          },
        });
      }
      return { requests: items };
    });
  }

  async createRequest(context: DomainContext, input: LeaveRequestInput) {
    requirePermission(context, 'leave.requests.write');
    return this.database.run(context, async (tx) => {
      const start = dateOnly(input.startDate);
      const end = dateOnly(input.endDate);
      if (end < start) throw new ConflictError('Leave end date must not precede start date');
      const [employee, type, settings] = await Promise.all([
        tx.employee.findFirst({
          where: {
            id: input.employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...(context.branchId ? employeeScope(context) : {}),
          },
          include: { manager: { select: { userId: true } } },
        }),
        tx.leaveType.findFirst({
          where: { id: input.leaveTypeId, organizationId: context.organizationId, isActive: true },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
      ]);
      if (!employee) throw new NotFoundError('Active employee');
      if (!type) throw new NotFoundError('Leave type');
      const branchId = context.branchId ?? input.branchId ?? employee.primaryBranchId;
      if (!branchId) throw new ConflictError('An employee branch is required for leave requests');
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const days = await workingDays(
        tx,
        context.organizationId,
        branchId,
        start,
        end,
        settings.workWeekDays,
      );
      if (days <= 0) throw new ConflictError('Leave request must contain at least one working day');
      if (type.requiresAttachment && !input.attachmentIds?.length)
        throw new ConflictError('This leave type requires supporting attachment');
      if (input.attachmentIds?.length) {
        const count = await tx.fileObject.count({
          where: {
            id: { in: input.attachmentIds },
            organizationId: context.organizationId,
            employeeId: employee.id,
            purpose: 'LEAVE_ATTACHMENT',
            status: 'AVAILABLE',
            deletedAt: null,
          },
        });
        if (count !== input.attachmentIds.length)
          throw new ConflictError('Every leave attachment must be an available tenant file');
      }
      const assignment = await tx.leavePolicyAssignment.findFirst({
        where: { organizationId: context.organizationId, branchId, leaveTypeId: type.id },
      });
      if (!assignment)
        throw new ConflictError('This leave policy is not assigned to the employee branch');
      await provisionBalance(
        tx,
        context.organizationId,
        employee.id,
        type,
        settings.leaveYearStartMonth,
        start,
      );
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_periodStart_periodEnd: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            ...leavePeriod(start, settings.leaveYearStartMonth),
          },
        },
      });
      if (!balance) throw new NotFoundError('Leave balance');
      const available = Number(balance.availableAmount);
      if (available < days) throw new ConflictError('Leave balance is insufficient');
      const activePolicies = await tx.approvalPolicy.findMany({
        where: {
          organizationId: context.organizationId,
          domain: 'LEAVE',
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
          'Configure a default leave approval policy before submitting leave requests',
        );
      await assertResolvableApprovers(
        tx,
        context.organizationId,
        branchId,
        employee.manager?.userId,
        employee.userId,
        policy.steps,
      );
      const request = await tx.leaveRequest.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          branchId,
          leaveTypeId: type.id,
          approvalPolicyId: policy.id,
          startDate: start,
          endDate: end,
          requestedDays: new Prisma.Decimal(days),
          reason: input.reason,
          status: LeaveRequestStatus.PENDING,
          sourceAccessMode: input.source,
          externalId: input.externalId,
          submittedAt: new Date(),
        },
      });
      if (input.attachmentIds?.length)
        await tx.fileObject.updateMany({
          where: { id: { in: input.attachmentIds }, organizationId: context.organizationId },
          data: { leaveRequestId: request.id },
        });
      const reserved = await tx.leaveBalance.updateMany({
        where: { id: balance.id, availableAmount: { gte: days } },
        data: {
          reservedAmount: { increment: days },
          availableAmount: { decrement: days },
          version: { increment: 1 },
        },
      });
      if (reserved.count !== 1) throw new ConflictError('Leave balance is insufficient');
      await ledger(tx, context, balance.id, {
        transactionType: LeaveBalanceTransactionType.RESERVATION,
        amount: new Prisma.Decimal(days),
        reason: `Reserved for leave request ${request.id}`,
        leaveRequestId: request.id,
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_REQUEST',
          entityId: request.id,
          action: 'LEAVE_REQUEST_SUBMITTED',
          afterState: jsonSnapshot(request),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'LeaveRequest',
          aggregateId: request.id,
          aggregateVersion: request.version,
          eventType: 'leave.request.submitted',
          payload: jsonSnapshot(toRequestDto(request, days)),
        },
        tx,
      );
      return toRequestDto(request, days);
    });
  }
}
