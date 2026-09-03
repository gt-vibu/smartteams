import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PayComponentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
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
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { currencyCode: true },
      });
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
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
      const employeePolicy = await saveEmployeePolicyInTransaction(tx, context, {
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        payrollEnabled: input.payrollEnabled,
        salarySlipMode: input.salarySlipMode,
        pfEnabled: input.pfEnabled,
        esiEnabled: input.esiEnabled,
        ptEnabled: input.ptEnabled,
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

  async getSalaryProfile(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.employee-profile.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        false,
        'payroll.employee-profile.read.all',
      );
      const effectiveDate = dateOnly(new Date().toISOString());
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
      const policy =
        (await findPolicy(tx, context.organizationId, new Date())) ?? DEFAULT_PAYROLL_POLICY;
      const compensation = employee.compensations[0] ?? null;
      const employeePolicy = employee.payrollPolicies[0] ?? null;
      const gross = compensation?.grossSalary ?? compensation?.baseAmount ?? new Prisma.Decimal(0);
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
        pf: employeePolicy?.pfEnabled ?? policy.pfDefault,
        esi: employeePolicy?.esiEnabled ?? policy.esiDefault,
        pt: employeePolicy?.ptEnabled ?? policy.ptDefault,
      };
      const statutory = rules
        .filter(
          (rule) =>
            (enabled.pf && ['PF', 'EPF'].includes(rule.schemeCode.toUpperCase())) ||
            (enabled.esi && rule.schemeCode.toUpperCase() === 'ESIC') ||
            (enabled.pt && ['PT', 'PROFESSIONAL_TAX'].includes(rule.schemeCode.toUpperCase())),
        )
        .map((rule) =>
          calculateStatutoryDeduction(structure, rule, policy.roundingMode, structure),
        );
      const assignedComponents = employee.payComponents.map((assignment) => ({
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
        organizationPolicy: policy,
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
        components: employee.payComponents,
      };
    });
  }
}
