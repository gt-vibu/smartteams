import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { ApproverType, type Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { RbacService } from '../rbac/rbac.service';
import { assertResolvableApprovers } from './approval-authorization';
import type {
  ApprovalExceptionsQueryDto,
  ApprovalReassignmentDto,
} from './approval-operations.dto';

type RoutedRequest = {
  id: string;
  employeeId: string;
  branchId: string | null;
  status: string;
  employee: {
    firstName: string;
    lastName: string;
    employeeNumber: string;
    userId: string | null;
    primaryBranchId: string | null;
    manager: { userId: string | null } | null;
  };
  approvals: Array<{ stepNumber: number }>;
  approvalPolicy: {
    name: string;
    steps: Array<{
      stepNumber: number;
      approverType: ApproverType;
      roleId: string | null;
      approverUserId: string | null;
      required: boolean;
    }>;
  } | null;
};
const employeeInclude = { include: { manager: { select: { userId: true } } } } as const;
const routingInclude = {
  approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
  approvals: true,
} as const;
function currentStep(request: RoutedRequest) {
  return request.approvalPolicy?.steps.find(
    (step) => !request.approvals.some((approval) => approval.stepNumber === step.stepNumber),
  );
}
function nextStepNumber(request: RoutedRequest) {
  return (
    currentStep(request)?.stepNumber ??
    Math.max(0, ...request.approvals.map((step) => step.stepNumber)) + 1
  );
}
function requireOperations(context: DomainContext, domain: string) {
  requirePermission(context, 'approval-policies.write');
  requirePermission(
    context,
    domain === 'LEAVE' ? 'leave.requests.read.all' : 'attendance.read.all',
  );
}

@Injectable()
export class ApprovalOperationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  exceptions(context: DomainContext, input: ApprovalExceptionsQueryDto) {
    requireOperations(context, input.domain);
    return this.database.run(
      context,
      async (tx) => {
        const pagination = {
          take: 101,
          orderBy: { id: 'asc' as const },
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        };
        const candidates: RoutedRequest[] =
          input.domain === 'LEAVE'
            ? await tx.leaveRequest.findMany({
                ...pagination,
                where: {
                  organizationId: context.organizationId,
                  status: 'PENDING',
                  sourceAccessMode: 'NATIVE',
                },
                include: { ...routingInclude, employee: employeeInclude },
              })
            : (
                await tx.attendanceCorrection.findMany({
                  ...pagination,
                  where: {
                    organizationId: context.organizationId,
                    status: 'PENDING',
                    requestedByClientId: null,
                  },
                  include: {
                    ...routingInclude,
                    attendanceRecord: { include: { employee: employeeInclude } },
                  },
                })
              ).map((request) => ({
                ...request,
                employeeId: request.attendanceRecord.employeeId,
                employee: request.attendanceRecord.employee,
                branchId: request.attendanceRecord.branchId,
              }));
        const items: Array<{
          id: string;
          domain: string;
          requester: string;
          stepNumber: number;
          reason: string;
        }> = [];
        for (const request of candidates.slice(0, 100)) {
          const step = currentStep(request);
          let reason: string | null = null;
          if (!step) reason = 'The request has no pending approval stage.';
          else if (!request.branchId) reason = 'The request has no branch for approval routing.';
          else {
            try {
              await assertResolvableApprovers(
                tx,
                context.organizationId,
                request.branchId,
                request.employee.manager?.userId,
                request.employee.userId,
                [step],
              );
            } catch (caught) {
              if (!(caught instanceof ConflictError)) throw caught;
              reason = caught.message;
            }
          }
          if (reason)
            items.push({
              id: request.id,
              domain: input.domain,
              requester: `${request.employee.firstName} ${request.employee.lastName} · ${request.employee.employeeNumber}`,
              stepNumber: nextStepNumber(request),
              reason,
            });
        }
        return {
          items,
          checked: Math.min(candidates.length, 100),
          nextCursor: candidates.length > 100 ? candidates[99]!.id : null,
        };
      },
      { timeout: 30000 },
    );
  }

  async reassign(context: DomainContext, input: ApprovalReassignmentDto) {
    requireOperations(context, input.domain);
    if (input.reason.trim().length < 2)
      throw new ConflictError('Explain why this request is being reassigned.');
    const permissions = await this.rbac.loadOrganizationPermissions(
      input.approverUserId,
      context.organizationId,
    );
    const needed =
      input.domain === 'LEAVE' ? 'leave.requests.decide' : 'attendance.corrections.decide';
    if (!permissions.has('*') && !permissions.has(needed))
      throw new ConflictError('Choose an active person with permission to approve these requests.');
    return this.database.run(context, async (tx) => {
      if (input.domain === 'LEAVE')
        await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${input.requestId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM attendance_corrections WHERE id = ${input.requestId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const request = await this.request(tx, context.organizationId, input);
      if (!request || request.status !== 'PENDING')
        throw new NotFoundError('Pending approval request');
      const pending = currentStep(request);
      if (nextStepNumber(request) !== input.expectedStepNumber)
        throw new ConflictError('The approval stage changed. Refresh this request.');
      const branchId = request.branchId ?? request.employee.primaryBranchId;
      if (!branchId)
        throw new ConflictError('Assign the employee to a branch before repairing routing.');
      const replacement = {
        stepNumber: nextStepNumber(request),
        approverType: ApproverType.USER,
        roleId: null,
        approverUserId: input.approverUserId,
        required: true,
      };
      await assertResolvableApprovers(
        tx,
        context.organizationId,
        branchId,
        request.employee.manager?.userId,
        request.employee.userId,
        [replacement],
      );
      const remaining =
        request.approvalPolicy?.steps.filter((step) => step.stepNumber > replacement.stepNumber) ??
        [];
      const policy = await tx.approvalPolicy.create({
        data: {
          organizationId: context.organizationId,
          domain: input.domain,
          code: `SYS_REQ_${request.id}_${randomUUID().slice(0, 8)}`,
          name: `${request.approvalPolicy?.name ?? 'Recovered approval'} · individual routing`,
          isActive: false,
          isDefault: false,
          createdByUserId: context.actor.userId,
          automation: { mode: 'MANUAL' },
          steps: {
            create: [replacement, ...remaining].map((step) => ({
              organizationId: context.organizationId,
              stepNumber: step.stepNumber,
              approverType: step.approverType,
              roleId: step.roleId,
              approverUserId: step.approverUserId,
              required: step.required,
            })),
          },
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      if (input.domain === 'LEAVE')
        await tx.leaveRequest.update({
          where: { id: request.id },
          data: { approvalPolicyId: policy.id, branchId, version: { increment: 1 } },
        });
      else {
        if (!request.branchId)
          throw new ConflictError(
            'Repair this attendance record’s missing branch before reassigning its correction.',
          );
        await tx.attendanceCorrection.update({
          where: { id: request.id },
          data: { approvalPolicyId: policy.id },
        });
      }
      await this.audit.record(
        { ...context, reason: input.reason },
        {
          entityType: input.domain === 'LEAVE' ? 'LEAVE_REQUEST' : 'ATTENDANCE_CORRECTION',
          entityId: request.id,
          action: 'APPROVAL_REASSIGNED',
          beforeState: jsonSnapshot({ step: pending, policyName: request.approvalPolicy?.name }),
          afterState: jsonSnapshot({
            approverUserId: input.approverUserId,
            stepNumber: replacement.stepNumber,
            approvalPolicyId: policy.id,
          }),
          reason: input.reason,
        },
        tx,
      );
      const requester = await requesterRouting(tx, context.organizationId, request.employeeId);
      await notify(tx, context, {
        recipients: await stepApprovers(
          tx,
          context.organizationId,
          replacement,
          requester,
          branchId,
        ),
        kind: input.domain === 'LEAVE' ? 'LEAVE_PENDING' : 'ATTENDANCE_CORRECTION_PENDING',
        title: 'Approval reassigned to you',
        body: `${requester.name} has a request waiting for your decision.`,
        module: 'approvals',
        entityType: input.domain === 'LEAVE' ? 'LEAVE_REQUEST' : 'ATTENDANCE_CORRECTION',
        entityId: request.id,
      });
      return {
        id: request.id,
        status: 'PENDING',
        stepNumber: replacement.stepNumber,
        approverUserId: input.approverUserId,
      };
    });
  }

  private async request(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: ApprovalReassignmentDto,
  ): Promise<(RoutedRequest & { attendanceRecordId?: string }) | null> {
    if (input.domain === 'LEAVE')
      return tx.leaveRequest.findFirst({
        where: { id: input.requestId, organizationId, sourceAccessMode: 'NATIVE' },
        include: { ...routingInclude, employee: employeeInclude },
      });
    const request = await tx.attendanceCorrection.findFirst({
      where: { id: input.requestId, organizationId, requestedByClientId: null },
      include: { ...routingInclude, attendanceRecord: { include: { employee: employeeInclude } } },
    });
    return request
      ? {
          ...request,
          employeeId: request.attendanceRecord.employeeId,
          employee: request.attendanceRecord.employee,
          branchId: request.attendanceRecord.branchId,
        }
      : null;
  }
}
