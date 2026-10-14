import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  dateOnly,
  toPolicyData,
  validatePolicy,
  type EmployeePolicyInput,
  type PolicyInput,
} from './payroll-policy.types';
import { findPolicy, requireEmployee } from './payroll-policy-access';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';
import { markPayrollStale } from './payroll-staleness';
import { validatePolicyComponents } from './payroll-policy-components';
import { saveEmployeePolicyInTransaction } from './payroll-policy-shared';

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

  async listPolicies(context: DomainContext) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollPolicy.findFirst({
        where: { organizationId: context.organizationId, isDefault: true },
      });
      if (!existing) {
        // Persist the same fallback rules the engine has always used. The baseline date
        // lets onboarding apply those rules to earlier joining dates too.
        await tx.payrollPolicy.upsert({
          where: {
            organizationId_name_effectiveFrom: {
              organizationId: context.organizationId,
              name: 'Standard payroll',
              effectiveFrom: new Date('1970-01-01'),
            },
          },
          create: {
            organizationId: context.organizationId,
            name: 'Standard payroll',
            isDefault: true,
            effectiveFrom: new Date('1970-01-01'),
            ...DEFAULT_PAYROLL_POLICY,
          },
          update: {},
        });
      }
      return tx.payrollPolicy.findMany({
        where: { organizationId: context.organizationId },
        include: {
          components: {
            include: { payComponent: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { effectiveFrom: 'desc' }],
      });
    });
  }

  async savePolicy(context: DomainContext, input: PolicyInput) {
    requirePermission(context, 'payroll.policy.write');
    validatePolicy(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new ConflictError('Policy end must not precede its start');
    return this.database.run(context, async (tx) => {
      const requestedName = input.name?.trim();
      if (input.name !== undefined && !requestedName)
        throw new ConflictError('Payroll policy name is required');
      const existing = input.id
        ? await tx.payrollPolicy.findFirst({
            where: { id: input.id, organizationId: context.organizationId },
          })
        : await tx.payrollPolicy.findFirst({
            where: {
              organizationId: context.organizationId,
              effectiveFrom,
              ...(requestedName ? { name: requestedName } : { isDefault: true }),
            },
          });
      if (input.id && !existing) throw new NotFoundError('Payroll policy');
      const name = requestedName ?? existing?.name ?? 'Standard payroll';
      if (existing && input.isDefault !== undefined && input.isDefault !== existing.isDefault)
        throw new ConflictError('An existing policy cannot change its default role');
      const isDefault =
        existing?.isDefault ?? input.isDefault ?? (!requestedName || name === 'Standard payroll');
      const overlap = await tx.payrollPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          ...(isDefault ? { isDefault: true } : { name }),
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (overlap) {
        // A new organization-default revision supersedes the version currently in force.
        // Preserve its history by closing it the day before this version starts. Previously,
        // this only handled the untouched 1970 fallback; after the first save, every later
        // update collided with the configured open-ended row and produced an overlap error.
        if (!isDefault || effectiveFrom <= overlap.effectiveFrom)
          throw new ConflictError('Payroll policy periods must not overlap');
        const previousEffectiveTo = new Date(effectiveFrom.getTime() - 86_400_000);
        await tx.payrollPolicy.update({
          where: { id: overlap.id },
          data: { effectiveTo: previousEffectiveTo },
        });
        await this.audit.record(
          context,
          {
            entityType: 'PAYROLL_POLICY',
            entityId: overlap.id,
            action: 'PAYROLL_POLICY_PERIOD_CLOSED',
            beforeState: jsonSnapshot(overlap),
            afterState: jsonSnapshot({ ...overlap, effectiveTo: previousEffectiveTo }),
          },
          tx,
        );
      }
      if (
        existing &&
        (effectiveFrom > existing.effectiveFrom ||
          (effectiveTo && (!existing.effectiveTo || effectiveTo < existing.effectiveTo)))
      ) {
        const affected = await tx.employeePayrollPolicy.count({
          where: {
            organizationId: context.organizationId,
            payrollPolicyId: existing.id,
            OR: [
              { effectiveFrom: { lt: effectiveFrom } },
              ...(effectiveTo ? [{ effectiveTo: null }, { effectiveTo: { gt: effectiveTo } }] : []),
            ],
          },
        });
        if (affected)
          throw new ConflictError('Policy dates cannot exclude assigned employee periods');
      }
      if (input.components !== undefined)
        await validatePolicyComponents(tx, context.organizationId, input.components);
      const policy = existing
        ? await tx.payrollPolicy.update({
            where: { id: existing.id },
            data: { name, effectiveFrom, ...toPolicyData(input, effectiveTo) },
          })
        : await tx.payrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              name,
              isDefault,
              effectiveFrom,
              ...toPolicyData(input, effectiveTo),
            },
          });
      if (input.components !== undefined) {
        await tx.payrollPolicyComponent.deleteMany({
          where: { organizationId: context.organizationId, payrollPolicyId: policy.id },
        });
        if (input.components.length)
          await tx.payrollPolicyComponent.createMany({
            data: input.components.map((component, index) => ({
              organizationId: context.organizationId,
              payrollPolicyId: policy.id,
              payComponentId: component.payComponentId,
              amount: component.amount,
              percentage: component.percentage,
              formulaParameters:
                component.formulaParameters === undefined
                  ? undefined
                  : jsonSnapshot(component.formulaParameters),
              displayOrder: component.displayOrder ?? index,
            })),
          });
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
      return tx.payrollPolicy.findUniqueOrThrow({
        where: { id: policy.id },
        include: { components: { orderBy: { displayOrder: 'asc' } } },
      });
    });
  }

  async saveEmployeePolicy(context: DomainContext, input: EmployeePolicyInput) {
    requirePermission(context, 'payroll.employee-profile.write');
    return this.database.run(context, async (tx) => {
      await requireEmployee(tx, context, input.employeeId, true);
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      const existing = await tx.employeePayrollPolicy.findUnique({
        where: {
          organizationId_employeeId_effectiveFrom: {
            organizationId: context.organizationId,
            employeeId: input.employeeId,
            effectiveFrom,
          },
        },
      });
      const policy = await saveEmployeePolicyInTransaction(tx, context, input);
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
