import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PayComponentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { withNationalStatutoryRules } from './payroll-national-statutory';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { markPayrollStale } from './payroll-staleness';
import { calculateSalaryStructure, calculateStatutoryDeduction } from './payroll-salary-structure';
import { calculateComponent } from './payroll-calculation';
import { dateOnly, type SalaryProfileInput } from './payroll-policy.types';
import {
  employeeScope,
  findPolicy,
  requireEmployee,
  resolveEmployeeId,
} from './payroll-policy-access';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';

import { saveEmployeePolicyInTransaction, statutoryName } from './payroll-policy-shared';
import { effectivePolicyComponents, policyComponentDefaults } from './payroll-policy-components';

/**
 * An employee's salary profile: what they are paid, and what the breakdown looks like.
 *
 * The read is the largest thing in this module because it assembles compensation, the assigned
 * components and the statutory position into one answer. Self-scoped: your own profile unless you
 * hold the organization-wide permission.
 */
@Injectable()
export class PayrollSalaryProfileService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async saveSalaryProfile(context: DomainContext, input: SalaryProfileInput) {
    requirePermission(context, 'payroll.employee-profile.write');
    if (!Number.isFinite(input.grossSalary) || input.grossSalary < 0)
      throw new ConflictError('Gross salary must be non-negative');
    if (!Number.isFinite(input.overtimeMultiplier) || input.overtimeMultiplier < 0)
      throw new ConflictError('Overtime multiplier must be finite and non-negative');
    return this.database.run(context, async (tx) => {
      await requireEmployee(tx, context, input.employeeId, true);
      // Someone who has left is kept as history; no new job, pay or reporting changes (native
      // only: the federation contract is frozen).
      if (context.accessMode === 'NATIVE') {
        const current = await tx.employee.findFirst({
          where: { id: input.employeeId, organizationId: context.organizationId },
          select: { status: true, firstName: true, lastName: true },
        });
        if (current && current.status !== 'ACTIVE')
          throw new ConflictError(
            `${current.firstName} ${current.lastName} has left the company, so this cannot be changed.`,
          );
      }
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { currencyCode: true },
      });
      const effectiveFrom = dateOnly(input.effectiveFrom);
      let effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      const dayBefore = (date: Date) => new Date(date.getTime() - 86_400_000);
      const scope = { organizationId: context.organizationId, employeeId: input.employeeId };
      // A salary revision: the salary running when the new one starts ends the day before it,
      // and a new open-ended salary stops the day before a revision already booked after it.
      await tx.employeeCompensation.updateMany({
        where: {
          ...scope,
          effectiveFrom: { lt: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        data: { effectiveTo: dayBefore(effectiveFrom) },
      });
      if (!effectiveTo) {
        const next = await tx.employeeCompensation.findFirst({
          where: { ...scope, effectiveFrom: { gt: effectiveFrom } },
          orderBy: { effectiveFrom: 'asc' },
        });
        if (next) effectiveTo = dayBefore(next.effectiveFrom);
      }
      const existingCompensation = await tx.employeeCompensation.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          effectiveFrom,
        },
      });
      const overlap = await tx.employeeCompensation.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          ...(existingCompensation ? { id: { not: existingCompensation.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Compensation periods must not overlap');
      const compensationData = {
        payType: input.payType,
        payFrequency: input.payFrequency,
        baseAmount: new Prisma.Decimal(input.grossSalary),
        grossSalary: new Prisma.Decimal(input.grossSalary),
        currencyCode: organization.currencyCode,
        overtimeMultiplier: new Prisma.Decimal(input.overtimeMultiplier),
        effectiveFrom,
        effectiveTo,
      };
      const compensation = existingCompensation
        ? await tx.employeeCompensation.update({
            where: { id: existingCompensation.id },
            data: compensationData,
          })
        : await tx.employeeCompensation.create({
            data: {
              organizationId: context.organizationId,
              employeeId: input.employeeId,
              ...compensationData,
            },
          });
      // Compensation is the basis every figure prorates from, so any calculated run covering the
      // effective window is now derived from a salary that has changed. Open-ended when the
      // record has no end date.
      await markPayrollStale(tx, context.organizationId, effectiveFrom, effectiveTo ?? undefined);
      const employeePolicy = await saveEmployeePolicyInTransaction(tx, context, {
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        payrollEnabled: input.payrollEnabled,
        salarySlipMode: input.salarySlipMode,
        pfEnabled: input.pfEnabled,
        esiEnabled: input.esiEnabled,
        ptEnabled: input.ptEnabled,
        payrollPolicyId: input.payrollPolicyId,
        statutoryJurisdiction: input.statutoryJurisdiction,
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_COMPENSATION',
          entityId: compensation.id,
          action: existingCompensation
            ? 'EMPLOYEE_COMPENSATION_UPDATED'
            : 'EMPLOYEE_COMPENSATION_CREATED',
          ...(existingCompensation ? { beforeState: jsonSnapshot(existingCompensation) } : {}),
          afterState: jsonSnapshot({ compensation, employeePolicy }),
        },
        tx,
      );
      return { compensation, employeePolicy };
    });
  }

  /**
   * The employee's salary profile. With `whatIf`, the figures are worked out for that salary and
   * those statutory switches instead of the saved ones, and nothing is written: it is the live
   * preview the screen shows while a salary is being typed, from the same calculation payroll uses.
   */
  async getSalaryProfile(
    context: DomainContext,
    requestedEmployeeId?: string,
    whatIf?: SalaryProfileWhatIf,
  ) {
    requirePermission(context, 'payroll.employee-profile.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        false,
        'payroll.employee-profile.read.all',
      );
      // "Today" where the organization is. In UTC, a salary saved from India early in the morning
      // to start that day was still in the future, so the screen went on showing no salary.
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { timezone: true },
      });
      const effectiveDate = dateOnly(localDateIn(organization.timezone));
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          organizationId: context.organizationId,
          ...employeeScope(context),
        },
        include: {
          compensations: {
            where: {
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          payrollPolicies: {
            where: {
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          payComponents: {
            where: {
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            include: { payComponent: true },
            orderBy: { effectiveFrom: 'desc' },
          },
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      const compensation =
        employee.compensations[0] ??
        // Nothing in force yet: show the salary saved to start later, rather than none at all.
        // Payroll runs price each period from its own dates, so this changes only the screen.
        (await tx.employeeCompensation.findFirst({
          where: { employeeId: employee.id, effectiveFrom: { gt: effectiveDate } },
          orderBy: { effectiveFrom: 'asc' },
        }));
      const employeePolicy = employee.payrollPolicies[0] ?? null;
      const policy =
        (await findPolicy(
          tx,
          context.organizationId,
          effectiveDate,
          employeePolicy?.payrollPolicyId,
        )) ?? DEFAULT_PAYROLL_POLICY;
      const organizationPolicy = employeePolicy?.payrollPolicyId
        ? ((await findPolicy(tx, context.organizationId, effectiveDate)) ?? DEFAULT_PAYROLL_POLICY)
        : policy;
      const components = effectivePolicyComponents(
        policyComponentDefaults(policy),
        employee.payComponents,
      );
      const gross =
        whatIf?.grossSalary !== undefined
          ? new Prisma.Decimal(whatIf.grossSalary)
          : (compensation?.grossSalary ?? compensation?.baseAmount ?? new Prisma.Decimal(0));

      const structure = calculateSalaryStructure(gross, policy);
      const statutoryJurisdiction =
        employeePolicy?.statutoryJurisdiction ?? policy.statutoryJurisdiction;
      const rules = statutoryJurisdiction
        ? await tx.payrollStatutoryRule.findMany({
            where: {
              organizationId: context.organizationId,
              jurisdiction: statutoryJurisdiction,
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          })
        : [];
      const enabled = {
        pf: whatIf?.pfEnabled ?? employeePolicy?.pfEnabled ?? policy.pfDefault,
        esi: whatIf?.esiEnabled ?? employeePolicy?.esiEnabled ?? policy.esiDefault,
        pt: whatIf?.ptEnabled ?? employeePolicy?.ptEnabled ?? policy.ptDefault,
      };
      const statutory = withNationalStatutoryRules(rules)
        .filter(
          (rule) =>
            (enabled.pf && ['PF', 'EPF'].includes(rule.schemeCode.toUpperCase())) ||
            (enabled.esi && rule.schemeCode.toUpperCase() === 'ESIC') ||
            (enabled.pt && ['PT', 'PROFESSIONAL_TAX'].includes(rule.schemeCode.toUpperCase())),
        )
        .map((rule) =>
          calculateStatutoryDeduction(structure, rule, policy.roundingMode, structure),
        );
      const assignedComponents = components.map((assignment) => ({
        code: assignment.payComponent.code,
        name: assignment.payComponent.name,
        componentType: assignment.payComponent.componentType,
        calculationType: assignment.payComponent.calculationType,
        isTaxable: assignment.payComponent.isTaxable,
        amount: calculateComponent(
          {
            amount: assignment.amount,
            percentage: assignment.percentage,
            component: assignment.payComponent,
          },
          structure.base,
        ),
      }));
      const extraEarnings = assignedComponents
        .filter(
          (component) =>
            component.componentType === PayComponentType.EARNING &&
            !['BASE', 'BASIC', 'HRA', 'OTHER_ALLOWANCE'].includes(component.code.toUpperCase()),
        )
        .reduce((total, component) => total.plus(component.amount), new Prisma.Decimal(0));
      const earnings = [
        {
          code: 'BASE',
          name: 'Base salary',
          componentType: PayComponentType.EARNING,
          amount: structure.base,
          isTaxable: true,
        },
        {
          code: 'HRA',
          name: 'HRA',
          componentType: PayComponentType.EARNING,
          amount: structure.hra,
          isTaxable: true,
        },
        {
          code: 'OTHER_ALLOWANCE',
          name: 'Other allowance',
          componentType: PayComponentType.EARNING,
          amount: Prisma.Decimal.max(
            new Prisma.Decimal(0),
            structure.otherAllowance.minus(extraEarnings),
          ),
          isTaxable: true,
        },
        ...assignedComponents.filter(
          (component) =>
            component.componentType === PayComponentType.EARNING &&
            !['BASE', 'BASIC', 'HRA', 'OTHER_ALLOWANCE'].includes(component.code.toUpperCase()),
        ),
      ];
      const deductions = [
        ...assignedComponents.filter(
          (component) => component.componentType === PayComponentType.DEDUCTION,
        ),
        ...statutory.map((item) => ({
          code: item.schemeCode,
          name: statutoryName(item.schemeCode),
          componentType: PayComponentType.DEDUCTION,
          amount: item.employeeAmount,
          isTaxable: false,
          eligible: item.eligible,
          basis: item.basis,
          reason: item.reason,
        })),
      ];
      const employerBenefits = [
        ...assignedComponents.filter(
          (component) => component.componentType === PayComponentType.EMPLOYER_CONTRIBUTION,
        ),
        ...statutory
          .filter((item) => item.employerAmount.greaterThan(0))
          .map((item) => ({
            code: item.schemeCode,
            name: `${statutoryName(item.schemeCode)} employer contribution`,
            componentType: PayComponentType.EMPLOYER_CONTRIBUTION,
            amount: item.employerAmount,
            isTaxable: false,
            eligible: item.eligible,
            basis: item.basis,
            reason: item.reason,
          })),
      ];
      const totalDeductions = deductions.reduce(
        (total, component) => total.plus(component.amount),
        new Prisma.Decimal(0),
      );
      const totalEmployerBenefits = employerBenefits.reduce(
        (total, component) => total.plus(component.amount),
        new Prisma.Decimal(0),
      );
      return {
        employeeId,
        compensation,
        employeePolicy,
        organizationPolicy,
        assignedPolicy: policy,
        structure,
        statutory,
        salaryBreakdown: {
          gross: structure.gross,
          earnings,
          deductions,
          employerBenefits,
          totalDeductions,
          totalEmployerBenefits,
          netPay: structure.gross.minus(totalDeductions),
        },
        components: components.map((component) => ({
          ...component,
          effectiveFrom:
            'effectiveFrom' in component
              ? component.effectiveFrom
              : 'effectiveFrom' in policy
                ? policy.effectiveFrom
                : effectiveDate,
          effectiveTo:
            'effectiveTo' in component
              ? component.effectiveTo
              : 'effectiveTo' in policy
                ? policy.effectiveTo
                : null,
        })),
      };
    });
  }
}

export type SalaryProfileWhatIf = {
  grossSalary?: number;
  pfEnabled?: boolean;
  esiEnabled?: boolean;
  ptEnabled?: boolean;
};

/** The calendar date now in `timeZone` (YYYY-MM-DD), falling back to UTC for an unknown zone. */
function localDateIn(timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
