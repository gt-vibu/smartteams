import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { type ApprovalDomain, ApproverType } from '../../generated/prisma/enums';
import { validateAutomation } from './approval-automation';

export type PolicyInput = {
  domain: ApprovalDomain;
  code: string;
  name: string;
  isDefault?: boolean;
  automation?: Record<string, unknown>;
  steps: Array<{
    stepNumber: number;
    approverType: ApproverType;
    roleId?: string;
    approverUserId?: string;
    required?: boolean;
  }>;
};

export function validateSteps(steps: PolicyInput['steps']) {
  if (!steps.length) throw new ConflictError('An approval policy requires at least one step');
  const stepNumbers = steps.map((step) => step.stepNumber);
  if (new Set(stepNumbers).size !== stepNumbers.length)
    throw new ConflictError('Approval step numbers must be unique');
  for (const step of steps) {
    if (step.required === false)
      throw new ConflictError(
        'Optional approval stages are not supported; remove the stage instead.',
      );
    const hasRole = Boolean(step.roleId);
    const hasUser = Boolean(step.approverUserId);
    if (
      (step.approverType === ApproverType.ROLE && (!hasRole || hasUser)) ||
      (step.approverType === ApproverType.USER && (!hasUser || hasRole)) ||
      // A manager step may name a backup role, for requesters with no manager to ask.
      (step.approverType === ApproverType.MANAGER && hasUser)
    )
      throw new ConflictError('Approval step approver does not match its approver type');
  }
}

export function toDto(policy: {
  id: string;
  organizationId: string;
  domain: ApprovalDomain;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  automation?: Prisma.JsonValue;
  steps: Array<{
    id: string;
    stepNumber: number;
    approverType: ApproverType;
    roleId: string | null;
    approverUserId: string | null;
    approverUser?: { displayName: string } | null;
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
    automation: validateAutomation(policy.domain, policy.automation),
    steps: policy.steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      approverType: step.approverType,
      roleId: step.roleId,
      approverUserId: step.approverUserId,
      approverName: step.approverUser?.displayName,
      required: step.required,
    })),
  };
}
