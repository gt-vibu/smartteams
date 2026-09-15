import { Injectable } from '@nestjs/common';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

type PolicyInput = {
  domain: ApprovalDomain;
  code: string;
  name: string;
  isDefault?: boolean;
  steps: Array<{
    stepNumber: number;
    approverType: ApproverType;
    roleId?: string;
    approverUserId?: string;
    required?: boolean;
  }>;
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(context: DomainContext) {
    requirePermission(context, 'approval-policies.read');
    return this.database.run(context, (tx) =>
      tx.approvalPolicy
        .findMany({
          where: { organizationId: context.organizationId },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
          orderBy: [{ domain: 'asc' }, { code: 'asc' }],
        })
        .then((policies) => policies.map(toDto)),
    );
  }

  async create(context: DomainContext, input: PolicyInput) {
    requirePermission(context, 'approval-policies.write');
    validateSteps(input.steps);
    return this.database.run(context, async (tx) => {
      const roles = input.steps.filter((step) => step.roleId).map((step) => step.roleId!);
      const users = input.steps
        .filter((step) => step.approverUserId)
        .map((step) => step.approverUserId!);
      if (
        roles.length &&
        (await tx.role.count({
          where: { id: { in: roles }, organizationId: context.organizationId },
        })) !== roles.length
      )
        throw new NotFoundError('Approval role');
      if (
        users.length &&
        (await tx.userOrganization.count({
          where: {
            organizationId: context.organizationId,
            userId: { in: users },
            status: 'ACTIVE',
          },
        })) !== users.length
      )
        throw new NotFoundError('Approval user');
      const activeDefaultCount = await tx.approvalPolicy.count({
        where: {
          organizationId: context.organizationId,
          domain: input.domain,
          isActive: true,
          isDefault: true,
        },
      });
      const makeDefault = input.isDefault === true || activeDefaultCount === 0;
      if (makeDefault)
        await tx.approvalPolicy.updateMany({
          where: {
            organizationId: context.organizationId,
            domain: input.domain,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      const policy = await tx.approvalPolicy.create({
        data: {
          organizationId: context.organizationId,
          domain: input.domain,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          isDefault: makeDefault,
          createdByUserId: context.actor.userId,
          steps: {
            create: input.steps.map((step) => ({
              organizationId: context.organizationId,
              stepNumber: step.stepNumber,
              approverType: step.approverType,
              roleId: step.roleId,
              approverUserId: step.approverUserId,
              required: step.required ?? true,
            })),
          },
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'APPROVAL_POLICY',
          entityId: policy.id,
          action: 'APPROVAL_POLICY_CREATED',
          afterState: jsonSnapshot(policy),
        },
        tx,
      );
      return toDto(policy);
    });
  }

  async update(
    context: DomainContext,
    policyId: string,
    input: {
      code?: string;
      name?: string;
      isDefault?: boolean;
      steps?: PolicyInput['steps'];
    },
  ) {
    requirePermission(context, 'approval-policies.write');
    if (input.steps) validateSteps(input.steps);
    return this.database.run(context, async (tx) => {
      const before = await tx.approvalPolicy.findFirst({
        where: { id: policyId, organizationId: context.organizationId, isActive: true },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      if (!before) throw new NotFoundError('Approval policy');
      const otherDefaultCount = await tx.approvalPolicy.count({
        where: {
          organizationId: context.organizationId,
          domain: before.domain,
          isActive: true,
          isDefault: true,
          id: { not: before.id },
        },
      });
      const makeDefault =
        input.isDefault === true ||
        (input.isDefault !== false && before.isDefault) ||
        otherDefaultCount === 0;
      if (makeDefault)
        await tx.approvalPolicy.updateMany({
          where: {
            organizationId: context.organizationId,
            domain: before.domain,
            isDefault: true,
            id: { not: before.id },
          },
          data: { isDefault: false },
        });
      if (input.steps) {
        const stepIds = before.steps.map((step) => step.id);
        const [attendance, leave, timesheet, payroll] = await Promise.all([
          tx.attendanceApproval.count({ where: { approvalPolicyStepId: { in: stepIds } } }),
          tx.leaveApproval.count({ where: { approvalPolicyStepId: { in: stepIds } } }),
          tx.timesheetApproval.count({ where: { approvalPolicyStepId: { in: stepIds } } }),
          tx.payrollApproval.count({ where: { approvalPolicyStepId: { in: stepIds } } }),
        ]);
        if (attendance + leave + timesheet + payroll > 0)
          throw new ConflictError(
            'Approval policy steps already have workflow history and cannot be replaced',
          );
        const roles = input.steps.filter((step) => step.roleId).map((step) => step.roleId!);
        const users = input.steps
          .filter((step) => step.approverUserId)
          .map((step) => step.approverUserId!);
        if (
          roles.length &&
          (await tx.role.count({
            where: { id: { in: roles }, organizationId: context.organizationId },
          })) !== roles.length
        )
          throw new NotFoundError('Approval role');
        if (
          users.length &&
          (await tx.userOrganization.count({
            where: {
              organizationId: context.organizationId,
              userId: { in: users },
              status: 'ACTIVE',
            },
          })) !== users.length
        )
          throw new NotFoundError('Approval user');
        await tx.approvalPolicyStep.deleteMany({ where: { approvalPolicyId: before.id } });
      }
      const after = await tx.approvalPolicy.update({
        where: { id: before.id },
        data: {
          code: input.code?.trim().toUpperCase(),
          name: input.name?.trim(),
          isDefault: makeDefault,
          steps: input.steps
            ? {
                create: input.steps.map((step) => ({
                  organizationId: context.organizationId,
                  stepNumber: step.stepNumber,
                  approverType: step.approverType,
                  roleId: step.roleId,
                  approverUserId: step.approverUserId,
                  required: step.required ?? true,
                })),
              }
            : undefined,
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'APPROVAL_POLICY',
          entityId: after.id,
          action: 'APPROVAL_POLICY_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return toDto(after);
    });
  }

  async deactivate(context: DomainContext, policyId: string, reason: string) {
    requirePermission(context, 'approval-policies.write');
    if (!reason.trim()) throw new ConflictError('Approval policy deactivation requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.approvalPolicy.findFirst({
        where: { id: policyId, organizationId: context.organizationId, isActive: true },
      });
      if (!before) throw new NotFoundError('Approval policy');
      const after = await tx.approvalPolicy.update({
        where: { id: before.id },
        data: { isActive: false, isDefault: false },
      });
      await this.audit.record(
        { ...context, reason },
        {
          entityType: 'APPROVAL_POLICY',
          entityId: after.id,
          action: 'APPROVAL_POLICY_DEACTIVATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
          reason,
        },
        tx,
      );
      return toDto({ ...after, steps: [] });
    });
  }

  async reactivate(context: DomainContext, policyId: string) {
    requirePermission(context, 'approval-policies.write');
    return this.database.run(context, async (tx) => {
      const before = await tx.approvalPolicy.findFirst({
        where: { id: policyId, organizationId: context.organizationId, isActive: false },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      if (!before) throw new NotFoundError('Inactive approval policy');
      const activeDefaultCount = await tx.approvalPolicy.count({
        where: {
          organizationId: context.organizationId,
          domain: before.domain,
          isActive: true,
          isDefault: true,
        },
      });
      const makeDefault = activeDefaultCount === 0;
      if (makeDefault)
        await tx.approvalPolicy.updateMany({
          where: {
            organizationId: context.organizationId,
            domain: before.domain,
            isActive: true,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      const after = await tx.approvalPolicy.update({
        where: { id: before.id },
        data: { isActive: true, isDefault: makeDefault },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'APPROVAL_POLICY',
          entityId: after.id,
          action: 'APPROVAL_POLICY_REACTIVATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return toDto(after);
    });
  }
}

function validateSteps(steps: PolicyInput['steps']) {
  if (!steps.length) throw new ConflictError('An approval policy requires at least one step');
  const stepNumbers = steps.map((step) => step.stepNumber);
  if (new Set(stepNumbers).size !== stepNumbers.length)
    throw new ConflictError('Approval step numbers must be unique');
  for (const step of steps) {
    const hasRole = Boolean(step.roleId);
    const hasUser = Boolean(step.approverUserId);
    if (
      (step.approverType === ApproverType.ROLE && (!hasRole || hasUser)) ||
      (step.approverType === ApproverType.USER && (!hasUser || hasRole)) ||
      (step.approverType === ApproverType.MANAGER && (hasRole || hasUser))
    )
      throw new ConflictError('Approval step approver does not match its approver type');
  }
}

function toDto(policy: {
  id: string;
  organizationId: string;
  domain: ApprovalDomain;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  steps: Array<{
    id: string;
    stepNumber: number;
    approverType: ApproverType;
    roleId: string | null;
    approverUserId: string | null;
    required: boolean;
  }>;
}) {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    domain: policy.domain,
    code: policy.code,
    name: policy.name,
    isDefault: policy.isDefault,
    isActive: policy.isActive,
    steps: policy.steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      approverType: step.approverType,
      roleId: step.roleId,
      approverUserId: step.approverUserId,
      required: step.required,
    })),
  };
}
