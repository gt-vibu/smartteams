import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  dateOnly,
  toEmployeePolicyData,
  toPolicyData,
  validatePolicy,
  type EmployeePolicyInput,
  type PolicyInput,
} from './payroll-policy.types';
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

  async savePolicy(context: DomainContext, input: PolicyInput) {
    requirePermission(context, 'payroll.policy.write');
    validatePolicy(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new ConflictError('Policy end must not precede its start');
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollPolicy.findUnique({
        where: {
          organizationId_effectiveFrom: { organizationId: context.organizationId, effectiveFrom },
        },
      });
      const overlap = await tx.payrollPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Payroll policy periods must not overlap');
      const policy = existing
        ? await tx.payrollPolicy.update({
            where: { id: existing.id },
            data: toPolicyData(input, effectiveTo),
          })
        : await tx.payrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              effectiveFrom,
              ...toPolicyData(input, effectiveTo),
            },
          });
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
                effectiveFrom,
                employeeRate: 12,
                employerRate: 12,
                wageCeiling: 15000,
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
                    'Karnataka Professional Tax notification; verify for the effective period',
                  slabs: [
                    { min: 0, max: 24999.99, amount: 0 },
                    { min: 25000, max: null, amount: 200 },
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
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Compensation period end must not precede its start');
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Employee policy end must not precede its start');
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
            data: toEmployeePolicyData(input, effectiveTo),
          })
        : await tx.employeePayrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              employeeId: input.employeeId,
              effectiveFrom,
              ...toEmployeePolicyData(input, effectiveTo),
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
