import { ConflictError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { findPolicy } from './payroll-policy-access';

export type PayrollAssignmentCriteria = {
  departmentIds?: string[];
  branchIds?: string[];
  employmentTypes?: string[];
  jobTitles?: string[];
  gradeValues?: string[];
};

export type PayrollAssignmentRuleLike<TPolicy = unknown> = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  payrollPolicyId: string;
  criteria: unknown;
  payrollPolicy?: TPolicy;
};

export type PayrollAssignmentCategory = {
  departmentId?: string | null;
  branchId?: string | null;
  employmentType?: string | null;
  jobTitle?: string | null;
  gradeValue?: string | null;
};

export function payrollAssignmentCategory(employee: {
  departmentId?: string | null;
  primaryBranchId?: string | null;
  employmentType?: string | null;
  customFields?: unknown;
  employmentRecords?: Array<{ jobTitle?: string | null; employmentType?: string | null }>;
}): PayrollAssignmentCategory {
  const custom = employee.customFields && typeof employee.customFields === 'object' && !Array.isArray(employee.customFields)
    ? employee.customFields as Record<string, unknown>
    : {};
  const grade = [custom.grade, custom.gradeValue, custom.employeeGrade]
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return {
    departmentId: employee.departmentId,
    branchId: employee.primaryBranchId,
    employmentType: employee.employmentRecords?.[0]?.employmentType ?? employee.employmentType,
    jobTitle: employee.employmentRecords?.[0]?.jobTitle,
    gradeValue: grade,
  };
}

const criterionKeys = [
  'departmentIds',
  'branchIds',
  'employmentTypes',
  'jobTitles',
  'gradeValues',
] as const;

export function parsePayrollAssignmentCriteria(value: unknown): PayrollAssignmentCriteria {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConflictError('Choose at least one employee category for this rule');
  const input = value as Record<string, unknown>;
  const result: PayrollAssignmentCriteria = {};
  for (const key of criterionKeys) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string' || !entry.trim()))
      throw new ConflictError(`Invalid ${key} in salary assignment criteria`);
    const values = [
      ...new Set(
        raw
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim()),
      ),
    ];
    if (values.length) result[key] = values;
  }
  if (Object.keys(result).length === 0)
    throw new ConflictError('Choose at least one employee category for this rule');
  const unknown = Object.keys(input).filter((key) => !(criterionKeys as readonly string[]).includes(key));
  if (unknown.length) throw new ConflictError(`Unsupported salary assignment criteria: ${unknown.join(', ')}`);
  return result;
}

function includes(values: string[] | undefined, value: string | null | undefined) {
  return !values?.length || Boolean(value && values.includes(value));
}

export function matchesPayrollAssignmentRule<TPolicy>(
  rule: PayrollAssignmentRuleLike<TPolicy>,
  category: PayrollAssignmentCategory,
  effectiveDate: Date,
) {
  if (!rule.enabled || rule.effectiveFrom > effectiveDate || (rule.effectiveTo && rule.effectiveTo < effectiveDate))
    return false;
  const criteria = parsePayrollAssignmentCriteria(rule.criteria);
  return (
    includes(criteria.departmentIds, category.departmentId) &&
    includes(criteria.branchIds, category.branchId) &&
    includes(criteria.employmentTypes, category.employmentType) &&
    includes(criteria.jobTitles?.map((value) => value.toLocaleLowerCase()), category.jobTitle?.toLocaleLowerCase()) &&
    includes(criteria.gradeValues?.map((value) => value.toLocaleLowerCase()), category.gradeValue?.toLocaleLowerCase())
  );
}

/** Individual policy overrides are resolved by the caller first; this handles category rules. */
export function resolvePayrollAssignmentRule<TPolicy>(
  rules: readonly PayrollAssignmentRuleLike<TPolicy>[],
  category: PayrollAssignmentCategory,
  effectiveDate: Date,
) {
  const matches = rules
    .filter((rule) => matchesPayrollAssignmentRule(rule, category, effectiveDate))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (!matches.length) return null;
  const highestPriority = matches[0]!.priority;
  const winners = matches.filter((rule) => rule.priority === highestPriority);
  const policyIds = new Set(winners.map((rule) => rule.payrollPolicyId));
  if (policyIds.size > 1)
    throw new ConflictError(
      `Salary structure conflict: ${winners.map((rule) => rule.name).join(', ')} match at the same priority. Set a unique priority or resolve the rules.`,
    );
  return winners[0]!;
}

export async function resolveEmployeePayrollAssignment(
  tx: TenantTransaction,
  context: DomainContext,
  employeeId: string,
  effectiveDate: Date,
  explicitPolicyId?: string,
) {
  if (explicitPolicyId) {
    const policy = await tx.payrollPolicy.findFirst({
      where: {
        id: explicitPolicyId,
        organizationId: context.organizationId,
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
      },
    });
    if (!policy) throw new ConflictError('Choose a salary structure effective on the assignment date');
    return { payrollPolicyId: policy.id, assignmentSource: 'INDIVIDUAL_OVERRIDE', assignmentRuleId: null };
  }

  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (!employee) throw new ConflictError('Employee not found in this organization');
  // Salary assignment intentionally has two levels only: the tenant-wide default, or an
  // explicit employee override. Legacy category rules are retained for history but no longer
  // influence new payroll calculations.
  const organizationDefault = await findPolicy(tx, context.organizationId, effectiveDate);
  if (!organizationDefault) throw new ConflictError('Set an organization default salary structure before assigning payroll');
  return { payrollPolicyId: organizationDefault.id, assignmentSource: 'ORGANIZATION_DEFAULT', assignmentRuleId: null };
}
