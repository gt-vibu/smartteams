import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  LeaveBalanceTransactionType,
  LeaveRequestStatus,
  type AccessMode,
  type LeaveAccrualType,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import {
  assertApprover,
  assertResolvableApprovers,
  canApprove,
} from '../approvals/approval-authorization';

type LeaveTypeInput = {
  code: string;
  name: string;
  paid: boolean;
  accrualType: LeaveAccrualType;
  annualAllowance?: number;
  monthlyAccrual?: number;
  carryoverLimit?: number;
  requiresAttachment: boolean;
};
type LeaveRequestInput = {
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
export class LeaveService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createType(context: DomainContext, input: LeaveTypeInput) {
    requirePermission(context, 'leave.types.write');
    return this.database.run(context, async (tx) => {
      const type = await tx.leaveType.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_TYPE',
          entityId: type.id,
          action: 'LEAVE_TYPE_CREATED',
          afterState: jsonSnapshot(type),
        },
        tx,
      );
      return this.toTypeDto(type);
    });
  }

  async listTypes(context: DomainContext) {
    requirePermission(context, 'leave.types.read');
    return this.database.run(context, (tx) =>
      tx.leaveType
        .findMany({
          where: { organizationId: context.organizationId, isActive: true },
          orderBy: { code: 'asc' },
        })
        .then((types) => types.map((type) => this.toTypeDto(type))),
    );
  }

  async syncType(context: DomainContext, code: string, input: LeaveTypeInput) {
    requirePermission(context, 'leave.types.write');
    return this.database.run(context, async (tx) => {
      const codeValue = code.trim().toUpperCase();
      const before = await tx.leaveType.findUnique({
        where: { organizationId_code: { organizationId: context.organizationId, code: codeValue } },
      });
      const type = await tx.leaveType.upsert({
        where: { organizationId_code: { organizationId: context.organizationId, code: codeValue } },
        create: {
          organizationId: context.organizationId,
          code: codeValue,
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
        update: {
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_TYPE',
          entityId: type.id,
          action: before ? 'LEAVE_TYPE_SYNCED' : 'LEAVE_TYPE_PROVISIONED',
          beforeState: before ? jsonSnapshot(before) : undefined,
          afterState: jsonSnapshot(type),
        },
        tx,
      );
      return this.toTypeDto(type);
    });
  }

  async assignTypeToBranch(context: DomainContext, code: string) {
    requirePermission(context, 'leave.types.write');
    if (!context.branchId) throw new ConflictError('A branch is required to assign a leave policy');
    return this.database.run(context, async (tx) => {
      const [branch, type, settings] = await Promise.all([
        tx.branch.findFirst({
          where: { id: context.branchId, organizationId: context.organizationId, status: 'ACTIVE' },
        }),
        tx.leaveType.findFirst({
          where: {
            organizationId: context.organizationId,
            code: code.trim().toUpperCase(),
            isActive: true,
          },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
      ]);
      if (!branch) throw new NotFoundError('Branch');
      if (!type) throw new NotFoundError('Leave type');

      const assignment = await tx.leavePolicyAssignment.upsert({
        where: {
          organizationId_branchId_leaveTypeId: {
            organizationId: context.organizationId,
            branchId: branch.id,
            leaveTypeId: type.id,
          },
        },
        create: {
          organizationId: context.organizationId,
          branchId: branch.id,
          leaveTypeId: type.id,
          sourceAccessMode: context.accessMode,
        },
        update: { sourceAccessMode: context.accessMode },
        include: { leaveType: true, branch: { select: { id: true, name: true, code: true } } },
      });
      const employees = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          OR: [
            { primaryBranchId: branch.id },
            { branchAssignments: { some: { branchId: branch.id, endsOn: null } } },
          ],
        },
        select: { id: true },
      });
      let balancesProvisioned = 0;
      for (const employee of employees) {
        const created = await this.provisionBalance(
          tx,
          context.organizationId,
          employee.id,
          type,
          settings.leaveYearStartMonth,
          new Date(),
        );
        if (created) balancesProvisioned += 1;
      }
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_POLICY_ASSIGNMENT',
          entityId: assignment.id,
          action: 'LEAVE_POLICY_ASSIGNED_TO_BRANCH',
          afterState: jsonSnapshot({ assignment, balancesProvisioned }),
        },
        tx,
      );
      return {
        id: assignment.id,
        branch: assignment.branch,
        leaveType: this.toTypeDto(assignment.leaveType),
        assignedEmployeeCount: employees.length,
        balancesProvisioned,
      };
    });
  }

  async listAssignments(context: DomainContext) {
    requirePermission(context, 'leave.types.read');
    if (!context.branchId)
      throw new ConflictError('A branch is required to list leave assignments');
    return this.database.run(context, async (tx) => {
      const assignments = await tx.leavePolicyAssignment.findMany({
        where: { organizationId: context.organizationId, branchId: context.branchId },
        include: { leaveType: true, branch: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const assignedEmployeeCount = await tx.employee.count({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          OR: [
            { primaryBranchId: context.branchId },
            { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
          ],
        },
      });
      return assignments.map((assignment) => ({
        id: assignment.id,
        branch: assignment.branch,
        leaveType: this.toTypeDto(assignment.leaveType),
        assignedEmployeeCount,
      }));
    });
  }

  async listBalances(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'leave.balances.read');
    return this.database.run(context, async (tx) => {
      let employeeId = requestedEmployeeId;
      if (!this.canReadAllEmployees(context, 'leave.balances.read.all')) {
        const self = await this.selfEmployee(tx, context);
        if (!self) return [];
        if (employeeId && employeeId !== self.id)
          throw new ConflictError('Employees may only read their own leave balances');
        employeeId = self.id;
      }
      if (employeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            id: employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...(context.branchId
              ? {
                  OR: [
                    { primaryBranchId: context.branchId },
                    { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            primaryBranchId: true,
            branchAssignments: { where: { endsOn: null }, select: { branchId: true } },
          },
        });
        if (!employee) throw new NotFoundError('Active employee');
        const branchIds = context.branchId
          ? [context.branchId]
          : Array.from(
              new Set(
                [
                  employee.primaryBranchId,
                  ...employee.branchAssignments.map((assignment) => assignment.branchId),
                ].filter((value): value is string => Boolean(value)),
              ),
            );
        const settings = await tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        });
        for (const branchId of branchIds)
          await this.provisionAssignedBalances(
            tx,
            context.organizationId,
            employee.id,
            branchId,
            settings.leaveYearStartMonth,
          );
      }
      return tx.leaveBalance.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
          ...(context.branchId
            ? { leaveType: { policyAssignments: { some: { branchId: context.branchId } } } }
            : {}),
        },
        include: { leaveType: true },
        orderBy: [{ employeeId: 'asc' }, { periodStart: 'desc' }],
      });
    });
  }
  async listRequests(
    context: DomainContext,
    requestedEmployeeId?: string,
    pagination: { cursor?: string; limit?: number } = {},
  ) {
    requirePermission(context, 'leave.requests.read');
    return this.database.run(context, async (tx) => {
      let employeeId = requestedEmployeeId;
      if (!this.canReadAllEmployees(context, 'leave.requests.read.all')) {
        const self = await this.selfEmployee(tx, context);
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
          ...this.toRequestDto(request),
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
            ...(context.branchId ? this.employeeScope(context) : {}),
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
      const days = await this.workingDays(
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
      await this.provisionBalance(
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
            ...this.leavePeriod(start, settings.leaveYearStartMonth),
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
      await this.ledger(tx, context, balance.id, {
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
          payload: jsonSnapshot(this.toRequestDto(request, days)),
        },
        tx,
      );
      return this.toRequestDto(request, days);
    });
  }

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
          await this.ledger(tx, context, balance.id, {
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
        }
      } else {
        await this.releaseReservation(
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
      return this.toRequestDto(updated, days);
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
        await this.releaseReservation(tx, context, balance.id, request.id, days, reason);
      if (request.status === LeaveRequestStatus.APPROVED) {
        await this.ledger(tx, context, balance.id, {
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
      return this.toRequestDto(updated, days);
    });
  }

  async adjustBalance(
    context: DomainContext,
    input: {
      employeeId: string;
      leaveTypeId: string;
      amount: number;
      reason: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    requirePermission(context, 'leave.balances.adjust');
    requireReason(
      { ...context, reason: input.reason },
      'Leave balance adjustment requires a reason',
    );
    return this.database.run(context, async (tx) => {
      const balance = await tx.leaveBalance.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: dateOnly(input.periodStart),
          periodEnd: dateOnly(input.periodEnd),
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
        },
      });
      if (!balance) throw new NotFoundError('Leave balance');
      const updated = await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { availableAmount: { increment: input.amount }, version: { increment: 1 } },
      });
      await this.ledger(tx, context, balance.id, {
        transactionType: LeaveBalanceTransactionType.ADJUSTMENT,
        amount: new Prisma.Decimal(input.amount),
        reason: input.reason,
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_BALANCE',
          entityId: balance.id,
          action: 'LEAVE_BALANCE_ADJUSTED',
          beforeState: jsonSnapshot(balance),
          afterState: jsonSnapshot(updated),
          reason: input.reason,
        },
        tx,
      );
      return updated;
    });
  }

  private async provisionAssignedBalances(
    tx: Prisma.TransactionClient,
    organizationId: string,
    employeeId: string,
    branchId: string,
    leaveYearStartMonth: number,
  ) {
    const assignments = await tx.leavePolicyAssignment.findMany({
      where: { organizationId, branchId },
      include: { leaveType: true },
    });
    for (const assignment of assignments)
      await this.provisionBalance(
        tx,
        organizationId,
        employeeId,
        assignment.leaveType,
        leaveYearStartMonth,
        new Date(),
      );
  }

  private async provisionBalance(
    tx: Prisma.TransactionClient,
    organizationId: string,
    employeeId: string,
    type: {
      id: string;
      accrualType: LeaveAccrualType;
      annualAllowance: Prisma.Decimal | null;
      monthlyAccrual: Prisma.Decimal | null;
    },
    leaveYearStartMonth: number,
    date: Date,
  ) {
    const { periodStart, periodEnd } = this.leavePeriod(date, leaveYearStartMonth);
    const existing = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_periodStart_periodEnd: {
          employeeId,
          leaveTypeId: type.id,
          periodStart,
          periodEnd,
        },
      },
    });
    if (existing) return false;
    const amount = this.initialEntitlement(type, periodStart, date);
    await tx.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_periodStart_periodEnd: {
          employeeId,
          leaveTypeId: type.id,
          periodStart,
          periodEnd,
        },
      },
      create: {
        organizationId,
        employeeId,
        leaveTypeId: type.id,
        periodStart,
        periodEnd,
        openingAmount: 0,
        accruedAmount: amount,
        usedAmount: 0,
        reservedAmount: 0,
        availableAmount: amount,
      },
      update: {},
    });
    return true;
  }

  private leavePeriod(date: Date, leaveYearStartMonth: number) {
    const periodStart = new Date(
      Date.UTC(
        date.getUTCFullYear() - (date.getUTCMonth() + 1 < leaveYearStartMonth ? 1 : 0),
        leaveYearStartMonth - 1,
        1,
      ),
    );
    return {
      periodStart,
      periodEnd: new Date(Date.UTC(periodStart.getUTCFullYear() + 1, leaveYearStartMonth - 1, 0)),
    };
  }

  private initialEntitlement(
    type: {
      accrualType: LeaveAccrualType;
      annualAllowance: Prisma.Decimal | null;
      monthlyAccrual: Prisma.Decimal | null;
    },
    periodStart: Date,
    date: Date,
  ) {
    if (type.accrualType === 'FIXED_ANNUAL') return type.annualAllowance ?? new Prisma.Decimal(0);
    if (type.accrualType === 'MONTHLY') {
      const months =
        (date.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 +
        date.getUTCMonth() -
        periodStart.getUTCMonth() +
        1;
      return (type.monthlyAccrual ?? new Prisma.Decimal(0)).mul(months);
    }
    return new Prisma.Decimal(0);
  }

  /**
   * Employee self-scoping, matching the convention already used by Timesheets, Compliance and
   * Payroll: a plain `read` permission may only see the caller's own records, `<permission>.all`
   * (or the tenant wildcard) may read other employees, and federation grants keep the read
   * breadth their scope already carries.
   */
  private canReadAllEmployees(context: DomainContext, readAllPermission: string) {
    return (
      context.accessMode === 'FEDERATION' ||
      context.permissions.has('*') ||
      context.permissions.has(readAllPermission)
    );
  }

  private selfEmployee(tx: Prisma.TransactionClient, context: DomainContext) {
    return tx.employee.findFirst({
      where: { organizationId: context.organizationId, userId: context.actor.userId },
      select: { id: true },
    });
  }

  private employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
    return {
      OR: [
        { primaryBranchId: context.branchId },
        { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
      ],
    };
  }

  private async releaseReservation(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    balanceId: string,
    requestId: string,
    days: number,
    reason: string,
  ) {
    await this.ledger(tx, context, balanceId, {
      transactionType: LeaveBalanceTransactionType.RELEASE,
      amount: new Prisma.Decimal(days),
      reason,
      leaveRequestId: requestId,
    });
    await tx.leaveBalance.update({
      where: { id: balanceId },
      data: {
        reservedAmount: { decrement: days },
        availableAmount: { increment: days },
        version: { increment: 1 },
      },
    });
  }

  private async ledger(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    balanceId: string,
    input: {
      transactionType: LeaveBalanceTransactionType;
      amount: Prisma.Decimal;
      reason: string;
      leaveRequestId?: string;
    },
  ) {
    await tx.leaveBalanceTransaction.create({
      data: {
        organizationId: context.organizationId,
        leaveBalanceId: balanceId,
        leaveRequestId: input.leaveRequestId,
        transactionType: input.transactionType,
        amount: input.amount,
        reason: input.reason,
        createdByUserId: context.actor.userId,
        createdByClientId: context.actor.clientId,
      },
    });
  }

  private async workingDays(
    tx: Prisma.TransactionClient,
    organizationId: string,
    branchId: string | null,
    start: Date,
    end: Date,
    weekDays: number[],
  ) {
    const holidays = await tx.holiday.findMany({
      where: {
        organizationId,
        isActive: true,
        holidayDate: { gte: start, lte: end },
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }),
      },
      select: { holidayDate: true },
    });
    const excluded = new Set(holidays.map((holiday) => dayKey(holiday.holidayDate)));
    let total = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1))
      if (weekDays.includes(cursor.getUTCDay() || 7) && !excluded.has(dayKey(cursor))) total += 1;
    return total;
  }

  private toTypeDto(type: {
    id: string;
    code: string;
    name: string;
    paid: boolean;
    accrualType: string;
    annualAllowance: unknown;
    monthlyAccrual: unknown;
    carryoverLimit: unknown;
    requiresAttachment: boolean;
    isActive: boolean;
  }) {
    return {
      id: type.id,
      code: type.code,
      name: type.name,
      paid: type.paid,
      accrualType: type.accrualType,
      annualAllowance: type.annualAllowance,
      monthlyAccrual: type.monthlyAccrual,
      carryoverLimit: type.carryoverLimit,
      requiresAttachment: type.requiresAttachment,
      isActive: type.isActive,
    };
  }
  private toRequestDto(
    request: {
      id: string;
      organizationId: string;
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      endDate: Date;
      requestedDays: unknown;
      status: string;
      version: number;
    },
    days = Number(request.requestedDays),
  ) {
    return {
      id: request.id,
      organizationId: request.organizationId,
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      startDate: request.startDate,
      endDate: request.endDate,
      requestedDays: days,
      status: request.status,
      version: request.version,
    };
  }
}

function encodeLeaveCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

function decodeLeaveCursor(cursor: string) {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !value.id
    ) {
      throw new Error('invalid');
    }
    return value.id;
  } catch {
    throw new ConflictError('Leave request cursor is invalid or expired');
  }
}

function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}
function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
