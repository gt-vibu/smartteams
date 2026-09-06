import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  AccessMode,
  PayComponentType,
  PayrollPaymentStatus,
  SalaryAdvanceStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { calculateSalaryStructure, calculateStatutoryDeduction } from './payroll-salary-structure';
import { calculateComponent } from './payroll-calculation';
import {
  dateOnly,
  toEmployeePolicyData,
  toPolicyData,
  validateStatutoryRule,
  validatePolicy,
  type AdvanceDecisionInput,
  type AdvanceInput,
  type EmployeePolicyInput,
  type PaymentInput,
  type PolicyComponentInput,
  type PolicyInput,
  type SalaryProfileInput,
  type StatutoryRuleInput,
} from './payroll-policy.types';
import {
  employeeScope,
  findPolicy,
  requireEmployee,
  resolveEmployeeId,
} from './payroll-policy-access';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';

@Injectable()
export class PayrollPolicyService {
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

  async savePolicy(context: DomainContext, input: PolicyInput) {
    requirePermission(context, 'payroll.policy.write');
    validatePolicy(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
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
      const payrollPolicyId = await resolvePayrollPolicyId(
        tx,
        context.organizationId,
        input.payrollEnabled,
        input.payrollPolicyId,
      );
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
            data: { ...toEmployeePolicyData(input, effectiveTo), payrollPolicyId },
          })
        : await tx.employeePayrollPolicy.create({
            data: {
              organizationId: context.organizationId,
              employeeId: input.employeeId,
              effectiveFrom,
              ...toEmployeePolicyData(input, effectiveTo),
              payrollPolicyId,
            },
          });
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
      const employeePolicy = await this.saveEmployeePolicyInTransaction(tx, context, {
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        payrollEnabled: input.payrollEnabled,
        salarySlipMode: input.salarySlipMode,
        pfEnabled: input.pfEnabled,
        esiEnabled: input.esiEnabled,
        ptEnabled: input.ptEnabled,
        statutoryJurisdiction: input.statutoryJurisdiction,
        payrollPolicyId: input.payrollPolicyId,
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
            include: {
              payrollPolicy: {
                include: {
                  components: {
                    include: { payComponent: true },
                    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
                  },
                },
              },
            },
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
      const compensation = employee.compensations[0] ?? null;
      const employeePolicy = employee.payrollPolicies[0] ?? null;
      const policy =
        employeePolicy?.payrollPolicy ??
        (await findPolicy(tx, context.organizationId, new Date())) ??
        DEFAULT_PAYROLL_POLICY;
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
      const policyComponents = employeePolicy?.payrollPolicy?.components ?? [];
      const employeeComponentIds = new Set(
        employee.payComponents.map((item) => item.payComponentId),
      );
      const assignedComponents = [
        ...policyComponents
          .filter((assignment) => !employeeComponentIds.has(assignment.payComponentId))
          .map((assignment) => ({ assignment, component: assignment.payComponent })),
        ...employee.payComponents.map((assignment) => ({
          assignment,
          component: assignment.payComponent,
        })),
      ].map(({ assignment, component }) => ({
        code: component.code,
        name: component.name,
        componentType: component.componentType,
        calculationType: component.calculationType,
        isTaxable: component.isTaxable,
        amount: calculateComponent(
          {
            amount: assignment.amount,
            percentage: assignment.percentage,
            component,
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
        payrollApplied: employeePolicy?.payrollEnabled ?? policy.payrollEnabledDefault,
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

  async listStatutoryRules(context: DomainContext, jurisdiction?: string) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) =>
      tx.payrollStatutoryRule.findMany({
        where: {
          organizationId: context.organizationId,
          ...(jurisdiction ? { jurisdiction } : {}),
        },
        orderBy: [{ jurisdiction: 'asc' }, { schemeCode: 'asc' }, { effectiveFrom: 'desc' }],
      }),
    );
  }

  async saveStatutoryRule(context: DomainContext, input: StatutoryRuleInput) {
    requirePermission(context, 'payroll.policy.write');
    validateStatutoryRule(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollStatutoryRule.findUnique({
        where: {
          organizationId_schemeCode_jurisdiction_effectiveFrom: {
            organizationId: context.organizationId,
            schemeCode: input.schemeCode.trim().toUpperCase(),
            jurisdiction: input.jurisdiction.trim().toUpperCase(),
            effectiveFrom,
          },
        },
      });
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Statutory rule end must not precede its start');
      const overlap = await tx.payrollStatutoryRule.findFirst({
        where: {
          organizationId: context.organizationId,
          schemeCode: input.schemeCode.trim().toUpperCase(),
          jurisdiction: input.jurisdiction.trim().toUpperCase(),
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Statutory rule periods must not overlap');
      const data = {
        schemeCode: input.schemeCode.trim().toUpperCase(),
        jurisdiction: input.jurisdiction.trim().toUpperCase(),
        effectiveTo,
        employeeRate:
          input.employeeRate === undefined ? null : new Prisma.Decimal(input.employeeRate),
        employerRate:
          input.employerRate === undefined ? null : new Prisma.Decimal(input.employerRate),
        wageCeiling: input.wageCeiling === undefined ? null : new Prisma.Decimal(input.wageCeiling),
        employeeThreshold:
          input.employeeThreshold === undefined
            ? null
            : new Prisma.Decimal(input.employeeThreshold),
        flatAmount: input.flatAmount === undefined ? null : new Prisma.Decimal(input.flatAmount),
        metadata: jsonSnapshot(input.metadata ?? {}),
      };
      return existing
        ? tx.payrollStatutoryRule.update({ where: { id: existing.id }, data })
        : tx.payrollStatutoryRule.create({
            data: { organizationId: context.organizationId, effectiveFrom, ...data },
          });
    });
  }

  async deleteStatutoryRule(context: DomainContext, ruleId: string) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollStatutoryRule.findFirst({
        where: { id: ruleId, organizationId: context.organizationId },
      });
      if (!existing) throw new NotFoundError('Statutory rule');
      await tx.payrollStatutoryRule.delete({ where: { id: existing.id } });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_STATUTORY_RULE',
          entityId: existing.id,
          action: 'PAYROLL_STATUTORY_RULE_DELETED',
          beforeState: jsonSnapshot(existing),
        },
        tx,
      );
      return { id: existing.id, deleted: true };
    });
  }

  async listAdvances(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.advances.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.advances.read.all',
      );
      return tx.salaryAdvance.findMany({
        where: {
          organizationId: context.organizationId,
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { recoveries: true },
        orderBy: { requestedAt: 'desc' },
      });
    });
  }

  async requestAdvance(context: DomainContext, input: AdvanceInput) {
    requirePermission(context, 'payroll.advances.request');
    requireReason({ ...context, reason: input.reason }, 'Advance request requires a reason');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        input.employeeId,
        false,
        'payroll.employee-profile.read.all',
      );
      if (!employeeId) throw new NotFoundError('Employee');
      if (input.amount <= 0 || !Number.isFinite(input.amount))
        throw new ConflictError('Advance amount must be greater than zero');
      return tx.salaryAdvance.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          requestedAmount: new Prisma.Decimal(input.amount),
          reason: input.reason.trim(),
          externalId: input.externalId,
          source: context.accessMode === AccessMode.FEDERATION ? 'FEDERATION' : 'NATIVE',
        },
      });
    });
  }

  async decideAdvance(context: DomainContext, advanceId: string, input: AdvanceDecisionInput) {
    requirePermission(context, 'payroll.advances.approve');
    requireReason({ ...context, reason: input.comment }, 'Advance decisions require a reason');
    return this.database.run(context, async (tx) => {
      const advance = await tx.salaryAdvance.findFirst({
        where: {
          id: advanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
      });
      if (!advance || advance.status !== SalaryAdvanceStatus.REQUESTED)
        throw new ConflictError('Advance is not awaiting a decision');
      if (input.status === 'APPROVED') {
        const amount = input.approvedAmount ?? Number(advance.requestedAmount);
        if (amount <= 0 || amount > Number(advance.requestedAmount))
          throw new ConflictError('Approved advance cannot exceed the requested amount');
        return tx.salaryAdvance.update({
          where: { id: advance.id },
          data: {
            status: SalaryAdvanceStatus.APPROVED,
            approvedAmount: new Prisma.Decimal(amount),
            approvedAt: new Date(),
            approvedByUserId: context.actor.userId,
          },
        });
      }
      return tx.salaryAdvance.update({
        where: { id: advance.id },
        data: {
          status: input.status,
          rejectedAt: new Date(),
          rejectedByUserId: context.actor.userId,
        },
      });
    });
  }

  async listPayments(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.payments.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.payments.read.all',
      );
      return tx.payrollPayment.findMany({
        where: {
          organizationId: context.organizationId,
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { payrollRun: { select: { periodStart: true, periodEnd: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async markPaymentPaid(context: DomainContext, lineItemId: string, input: PaymentInput) {
    requirePermission(context, 'payroll.payments.write');
    return this.database.run(context, async (tx) => {
      const line = await tx.payrollLineItem.findFirst({
        where: {
          id: lineItemId,
          organizationId: context.organizationId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { payrollRun: true },
      });
      if (!line || !['RELEASED', 'LOCKED'].includes(line.payrollRun.status))
        throw new ConflictError('Only released payroll lines can be paid');
      const existing = await tx.payrollPayment.findUnique({
        where: { payrollLineItemId: line.id },
      });
      if (existing?.status === PayrollPaymentStatus.PAID)
        throw new ConflictError('Payroll line is already marked paid');
      return tx.payrollPayment.upsert({
        where: { payrollLineItemId: line.id },
        create: {
          organizationId: context.organizationId,
          payrollRunId: line.payrollRunId,
          payrollLineItemId: line.id,
          employeeId: line.employeeId,
          amount: line.netAmount,
          status: PayrollPaymentStatus.PAID,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paidAt: new Date(),
          markedByUserId: context.actor.userId,
        },
        update: {
          status: PayrollPaymentStatus.PAID,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paidAt: new Date(),
          markedByUserId: context.actor.userId,
          failureReason: null,
        },
      });
    });
  }

  private async saveEmployeePolicyInTransaction(
    tx: TenantTransaction,
    context: DomainContext,
    input: EmployeePolicyInput,
  ) {
    const payrollPolicyId = await resolvePayrollPolicyId(
      tx,
      context.organizationId,
      input.payrollEnabled,
      input.payrollPolicyId,
    );
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
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
    return existing
      ? tx.employeePayrollPolicy.update({
          where: { id: existing.id },
          data: { ...toEmployeePolicyData(input, effectiveTo), payrollPolicyId },
        })
      : tx.employeePayrollPolicy.create({
          data: {
            organizationId: context.organizationId,
            employeeId: input.employeeId,
            effectiveFrom,
            ...toEmployeePolicyData(input, effectiveTo),
            payrollPolicyId,
          },
        });
  }
}

async function resolvePayrollPolicyId(
  tx: TenantTransaction,
  organizationId: string,
  payrollEnabled: boolean,
  payrollPolicyId?: string,
) {
  if (!payrollEnabled) return null;
  if (!payrollPolicyId) throw new ConflictError('Select a payroll policy when payroll is enabled');
  const policy = await tx.payrollPolicy.findFirst({
    where: { id: payrollPolicyId, organizationId },
    select: { id: true },
  });
  if (!policy) throw new NotFoundError('Payroll policy');
  return policy.id;
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

function statutoryName(code: string) {
  switch (code.toUpperCase()) {
    case 'EPF':
    case 'PF':
      return 'EPF';
    case 'ESIC':
      return 'ESI';
    case 'PT':
    case 'PROFESSIONAL_TAX':
      return 'Professional tax';
    default:
      return code;
  }
}
