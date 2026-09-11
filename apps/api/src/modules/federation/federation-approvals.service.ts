import { Injectable } from '@nestjs/common';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { FederatedEmployeeService } from './federated-employee.service';
import type {
  FederatedApprovalPolicyDto,
  FederatedApprovalPolicyPatchDto,
  FederatedApprovalStepDto,
} from './federation-approvals.dto';

@Injectable()
export class FederationApprovalsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly approvals: ApprovalsService,
    private readonly employees: FederatedEmployeeService,
  ) {}

  async list(context: DomainContext) {
    requirePermission(context, 'approval-policies.read');
    return this.database.run(context, async (tx) => {
      const policies = await tx.approvalPolicy.findMany({
        where: { organizationId: context.organizationId },
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: {
              role: { select: { code: true } },
              approverUser: { select: { employee: { select: { externalId: true } } } },
            },
          },
        },
        orderBy: [{ domain: 'asc' }, { code: 'asc' }],
      });
      return policies.map((policy) => ({
        id: policy.id,
        domain: policy.domain,
        code: policy.code,
        name: policy.name,
        isDefault: policy.isDefault,
        isActive: policy.isActive,
        steps: policy.steps.map((step) => ({
          id: step.id,
          stepNumber: step.stepNumber,
          approverType: step.approverType,
          roleCode: step.role?.code ?? null,
          approverExternalEmployeeId: step.approverUser?.employee?.externalId ?? null,
          required: step.required,
        })),
      }));
    });
  }

  async listApproverRoles(context: DomainContext, domain: ApprovalDomain) {
    requirePermission(context, 'approval-policies.read');
    const permission =
      domain === ApprovalDomain.LEAVE
        ? 'leave.requests.decide'
        : domain === ApprovalDomain.ATTENDANCE_CORRECTION
          ? 'attendance.corrections.decide'
          : null;
    if (!permission) return { roles: [] };
    return this.database.run(context, async (tx) => {
      const roles = await tx.role.findMany({
        where: {
          organizationId: context.organizationId,
          permissions: { some: { permission: { key: permission } } },
          ...(context.branchId ? { OR: [{ branchId: null }, { branchId: context.branchId }] } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          scope: true,
          branchId: true,
          branch: { select: { code: true, name: true } },
        },
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
      });
      return {
        roles: roles.map((role) => ({
          code: role.code,
          name: role.name,
          description: role.description,
          scope: role.scope,
          branchId: role.branchId,
          branch: role.branch,
        })),
      };
    });
  }

  async create(context: DomainContext, input: FederatedApprovalPolicyDto) {
    const steps = await this.resolveSteps(context, input.domain, input.steps);
    return this.approvals.create(context, { ...input, steps });
  }

  async update(context: DomainContext, policyId: string, input: FederatedApprovalPolicyPatchDto) {
    const existing = input.steps
      ? await this.database.run(context, (tx) =>
          tx.approvalPolicy.findFirst({
            where: { id: policyId, organizationId: context.organizationId, isActive: true },
            select: { domain: true },
          }),
        )
      : null;
    if (input.steps && !existing) throw new NotFoundError('Approval policy');
    const steps = input.steps
      ? await this.resolveSteps(context, existing!.domain, input.steps)
      : undefined;
    return this.approvals.update(context, policyId, {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(steps ? { steps } : {}),
    });
  }

  async deactivate(context: DomainContext, policyId: string, reason: string) {
    return this.approvals.deactivate(context, policyId, reason);
  }

  async reactivate(context: DomainContext, policyId: string) {
    return this.approvals.reactivate(context, policyId);
  }

  private async resolveSteps(
    context: DomainContext,
    domain: ApprovalDomain,
    steps: FederatedApprovalStepDto[],
  ) {
    const permission =
      domain === ApprovalDomain.LEAVE
        ? 'leave.requests.decide'
        : domain === ApprovalDomain.ATTENDANCE_CORRECTION
          ? 'attendance.corrections.decide'
          : null;
    return Promise.all(
      steps.map(async (step) => {
        const roleId = step.roleCode
          ? await this.database.run(context, async (tx) => {
              const role = await tx.role.findFirst({
                where: {
                  organizationId: context.organizationId,
                  code: step.roleCode,
                  ...(context.branchId
                    ? { OR: [{ branchId: null }, { branchId: context.branchId }] }
                    : {}),
                  ...(permission
                    ? { permissions: { some: { permission: { key: permission } } } }
                    : {}),
                },
                select: { id: true },
              });
              if (!role) throw new NotFoundError('Approval role');
              return role.id;
            })
          : undefined;
        const approverUserId = step.approverExternalEmployeeId
          ? await this.employees.internalUserId(context, step.approverExternalEmployeeId)
          : undefined;
        return {
          stepNumber: step.stepNumber,
          approverType: step.approverType,
          ...(roleId ? { roleId } : {}),
          ...(approverUserId ? { approverUserId } : {}),
          ...(step.required !== undefined ? { required: step.required } : {}),
        } satisfies {
          stepNumber: number;
          approverType: ApproverType;
          roleId?: string;
          approverUserId?: string;
          required?: boolean;
        };
      }),
    );
  }
}
