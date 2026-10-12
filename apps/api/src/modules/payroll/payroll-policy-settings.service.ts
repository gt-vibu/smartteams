import { assertOpenPayrollPeriod } from '../approvals/approval-automation';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  dateOnly,
  toEmployeePolicyData,
  toPolicyData,
  validatePolicy,
  type EmployeePolicyInput,
  type PolicyComponentInput,
  type PolicyInput,
  type PayrollAssignmentRuleInput,
} from './payroll-policy.types';
import { resolveEmployeePayrollAssignment } from './payroll-assignment-rules';
import { findPolicy, requireEmployee } from './payroll-policy-access';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';
import { markPayrollStale } from './payroll-staleness';

/**
 * The payroll policy itself: the organization-wide rules and the per-employee overrides.
 *
 * Effective-dated, so saving never edits history — a new row supersedes the old one from its own
 * date, and a run calculated earlier keeps the policy it was calculated under.
 */
@Injectable()
export class PayrollPolicySettingsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getPolicy(context: DomainContext, effectiveDate = new Date()) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) =>
      findPolicy(tx, context.organizationId, effectiveDate).then(
        (policy) => policy ?? DEFAULT_PAYROLL_POLICY,
      ),
    );
  }

  async listPolicies(context: DomainContext, effectiveDate = new Date()) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) =>
      tx.payrollPolicy.findMany({
        where: {
          organizationId: context.organizationId,
          effectiveFrom: { lte: effectiveDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
        },
        include: {
          components: {
            include: { payComponent: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ name: 'asc' }, { effectiveFrom: 'desc' }],
      }),
    );
  }

  async listAssignmentRules(context: DomainContext) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) => tx.payrollPolicyAssignmentRule.findMany({
      where: { organizationId: context.organizationId },
      include: { payrollPolicy: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    }));
  }

  saveAssignmentRule(context: DomainContext, input: PayrollAssignmentRuleInput): Promise<never> {
    void input;
    requirePermission(context, 'payroll.policy.write');
    return Promise.reject(new ConflictError(
      'Salary structures now use the organization default or an individual employee override. Category assignment rules are no longer supported.',
    ));
  }

  async savePolicy(context: DomainContext, input: PolicyInput) {
    requirePermission(context, 'payroll.policy.write');
    validatePolicy(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    let effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new ConflictError('Policy end must not precede its start');
    return this.database.run(context, async (tx) => {
      const existing = input.id
        ? await tx.payrollPolicy.findFirst({
            where: { id: input.id, organizationId: context.organizationId },
          })
        : await tx.payrollPolicy.findFirst({
            where: {
              organizationId: context.organizationId,
              name: input.name?.trim() || 'Standard payroll',
              effectiveFrom,
            },
          });
      if (input.id && !existing) throw new NotFoundError('Payroll policy');
      const policyInput: PolicyInput = {
        ...input,
        name: input.name?.trim() || existing?.name || 'Standard payroll',
      };
      let previousPolicy: Awaited<ReturnType<typeof tx.payrollPolicy.findFirst>> = null;
      if (!existing && !input.id) {
        previousPolicy = await tx.payrollPolicy.findFirst({
          where: {
            organizationId: context.organizationId,
            name: policyInput.name,
            effectiveFrom: { lt: effectiveFrom },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
          },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (previousPolicy) {
          const dayBefore = new Date(effectiveFrom.getTime() - 86_400_000);
          await tx.payrollPolicy.update({ where: { id: previousPolicy.id }, data: { effectiveTo: dayBefore } });
        }
        if (!input.effectiveTo) {
          const next = await tx.payrollPolicy.findFirst({
            where: {
              organizationId: context.organizationId,
              name: policyInput.name,
              effectiveFrom: { gt: effectiveFrom },
            },
            orderBy: { effectiveFrom: 'asc' },
          });
          if (next) effectiveTo = new Date(next.effectiveFrom.getTime() - 86_400_000);
        }
      }
      // Older policy editors do not send the optional gross default. Preserve it when they
      // revise other settings, and carry it forward to an effective-dated policy revision.
      policyInput.defaultGrossSalary = input.defaultGrossSalary === undefined
        ? existing?.defaultGrossSalary?.toNumber() ?? previousPolicy?.defaultGrossSalary?.toNumber() ?? null
        : input.defaultGrossSalary;
      const overlap = await tx.payrollPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          name: policyInput.name,
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap)
        throw new ConflictError('Payroll policy periods must not overlap for the same policy');
      const policy = existing
        ? await tx.payrollPolicy.update({
            where: { id: existing.id },
            data: toPolicyData(policyInput, effectiveTo),
          })
        : await tx.payrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              effectiveFrom,
              ...toPolicyData(policyInput, effectiveTo),
            },
          });
      await replacePolicyComponents(tx, context.organizationId, policy.id, policyInput.components);
      if (previousPolicy && policyInput.components === undefined) {
        const previousComponents = await tx.payrollPolicyComponent.findMany({
          where: { organizationId: context.organizationId, payrollPolicyId: previousPolicy.id },
        });
        if (previousComponents.length) {
          await tx.payrollPolicyComponent.createMany({
            data: previousComponents.map((component) => ({
              organizationId: context.organizationId,
              payrollPolicyId: policy.id,
              payComponentId: component.payComponentId,
              amount: component.amount,
              percentage: component.percentage,
              formulaParameters: component.formulaParameters as Prisma.InputJsonObject,
              displayOrder: component.displayOrder,
            })),
          });
        }
      }
      if (policy.statutoryJurisdiction) {
        const ruleCount = await tx.payrollStatutoryRule.count({
          where: {
            organizationId: context.organizationId,
            jurisdiction: policy.statutoryJurisdiction,
          },
        });
        if (ruleCount === 0) {
          await tx.payrollStatutoryRule.createMany({
            data: [
              {
                organizationId: context.organizationId,
                schemeCode: 'EPF',
                jurisdiction: policy.statutoryJurisdiction,
                effectiveFrom: effectiveFrom < new Date('2026-09-17T00:00:00.000Z')
                  ? new Date('2026-09-17T00:00:00.000Z')
                  : effectiveFrom,
                employeeRate: 12,
                employerRate: 12,
                wageCeiling: 25000,
                employeeThreshold: null,
                flatAmount: null,
              },
              {
                organizationId: context.organizationId,
                schemeCode: 'ESIC',
                jurisdiction: policy.statutoryJurisdiction,
                effectiveFrom,
                employeeRate: 0.75,
                employerRate: 3.25,
                wageCeiling: 21000,
                employeeThreshold: 21000,
                flatAmount: null,
              },
              {
                organizationId: context.organizationId,
                schemeCode: 'PT',
                jurisdiction: policy.statutoryJurisdiction,
                effectiveFrom,
                employeeRate: null,
                employerRate: null,
                wageCeiling: null,
                employeeThreshold: 25000,
                flatAmount: 200,
                metadata: {
                  source:
                    'Karnataka Professional Tax notification (effective April 1, 2025; Feb is ₹300)',
                  slabs: [
                    { min: 0, max: 24999.99, amount: 0 },
                    { min: 25000, max: null, amount: 200, monthOverrides: { '2': 300 } },
                  ],
                },
              },
            ],
            skipDuplicates: true,
          });
        }
      }
      // `payrollDayBasis`, the base and HRA percentages and the rounding mode all feed
      // `computePayrollLine`, so a calculated run inside this policy's effective window is no
      // longer derived from the policy it claims. Scoped to that window rather than to all time.
      await markPayrollStale(tx, context.organizationId, effectiveFrom, effectiveTo ?? undefined);
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_POLICY',
          entityId: policy.id,
          action: existing ? 'PAYROLL_POLICY_UPDATED' : 'PAYROLL_POLICY_CREATED',
          ...(existing ? { beforeState: jsonSnapshot(existing) } : {}),
          afterState: jsonSnapshot(policy),
        },
        tx,
      );
      return policy;
    });
  }

  async saveEmployeePolicy(context: DomainContext, input: EmployeePolicyInput) {
    requirePermission(context, 'payroll.employee-profile.write');
    return this.database.run(context, async (tx) => {
      await requireEmployee(tx, context, input.employeeId, true);
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const assignment = input.payrollEnabled
        ? await resolveEmployeePayrollAssignment(tx, context, input.employeeId, effectiveFrom, input.payrollPolicyId)
        : { payrollPolicyId: null, assignmentSource: 'ORGANIZATION_DEFAULT', assignmentRuleId: null };
      if (context.accessMode === 'NATIVE') {
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${input.employeeId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
        await assertOpenPayrollPeriod(tx, context.organizationId, effectiveFrom, input.effectiveTo ? dateOnly(input.effectiveTo) : new Date('9999-12-31'));
      }
      let effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Employee policy end must not precede its start');
      // A revision: the settings running when the new ones start end the day before them, and
      // new open-ended settings stop the day before a revision already booked after them.
      const dayBefore = (date: Date) => new Date(date.getTime() - 86_400_000);
      const scope = { organizationId: context.organizationId, employeeId: input.employeeId };
      await tx.employeePayrollPolicy.updateMany({
        where: {
          ...scope,
          effectiveFrom: { lt: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        data: { effectiveTo: dayBefore(effectiveFrom) },
      });
      if (!effectiveTo) {
        const next = await tx.employeePayrollPolicy.findFirst({
          where: { ...scope, effectiveFrom: { gt: effectiveFrom } },
          orderBy: { effectiveFrom: 'asc' },
        });
        if (next) effectiveTo = dayBefore(next.effectiveFrom);
      }
      const existing = await tx.employeePayrollPolicy.findUnique({
        where: {
          organizationId_employeeId_effectiveFrom: {
            organizationId: context.organizationId,
            employeeId: input.employeeId,
            effectiveFrom,
          },
        },
      });
      const overlap = await tx.employeePayrollPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Employee payroll policy periods must not overlap');
      const policy = existing
        ? await tx.employeePayrollPolicy.update({
            where: { id: existing.id },
            data: { ...toEmployeePolicyData(input, effectiveTo), ...assignment },
          })
        : await tx.employeePayrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              employeeId: input.employeeId,
              effectiveFrom,
              ...toEmployeePolicyData(input, effectiveTo),
              ...assignment,
            },
          });
      // `payrollEnabled` decides whether this employee is paid at all, and the PF/ESI/PT
      // toggles and jurisdiction decide which statutory deductions apply to them.
      await markPayrollStale(tx, context.organizationId, effectiveFrom, effectiveTo ?? undefined);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_PAYROLL_POLICY',
          entityId: policy.id,
          action: existing ? 'EMPLOYEE_PAYROLL_POLICY_UPDATED' : 'EMPLOYEE_PAYROLL_POLICY_CREATED',
          ...(existing ? { beforeState: jsonSnapshot(existing) } : {}),
          afterState: jsonSnapshot(policy),
        },
        tx,
      );
      return policy;
    });
  }
}

async function replacePolicyComponents(
  tx: TenantTransaction,
  organizationId: string,
  payrollPolicyId: string,
  components?: PolicyComponentInput[],
) {
  if (components === undefined) return;
  const uniqueIds = new Set(components.map((component) => component.payComponentId));
  if (uniqueIds.size !== components.length)
    throw new ConflictError('A payroll policy cannot include the same component twice');
  if (components.length) {
    const available = await tx.payComponent.findMany({
      where: { organizationId, id: { in: [...uniqueIds] } },
      select: { id: true },
    });
    if (available.length !== components.length) throw new NotFoundError('Pay component');
  }
  await tx.payrollPolicyComponent.deleteMany({ where: { payrollPolicyId, organizationId } });
  if (!components.length) return;
  await tx.payrollPolicyComponent.createMany({
    data: components.map((component, index) => ({
      organizationId,
      payrollPolicyId,
      payComponentId: component.payComponentId,
      amount: component.amount === undefined ? null : new Prisma.Decimal(component.amount),
      percentage:
        component.percentage === undefined ? null : new Prisma.Decimal(component.percentage),
      formulaParameters: (component.formulaParameters ?? {}) as Prisma.InputJsonObject,
      displayOrder: component.displayOrder ?? index,
    })),
  });
}
