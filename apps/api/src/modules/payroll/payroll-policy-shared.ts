import { type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { type TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { dateOnly, toEmployeePolicyData, type EmployeePolicyInput } from './payroll-policy.types';

/**
 * Payroll policy pieces used by more than one of the services below.
 *
 * `saveEmployeePolicyInTransaction` is called both when a policy is saved directly and when a
 * salary profile is written, so it belongs to neither service; `statutoryName` is a lookup.
 */

export async function saveEmployeePolicyInTransaction(
  tx: TenantTransaction,
  context: DomainContext,
  input: EmployeePolicyInput,
) {
  const effectiveFrom = dateOnly(input.effectiveFrom);
  let effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw new ConflictError('Employee policy end must not precede its start');
  // A revision: the settings running when the new ones start end the day before them, and new
  // open-ended settings stop the day before a revision already booked after them.
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
  return existing
    ? tx.employeePayrollPolicy.update({
        where: { id: existing.id },
        data: toEmployeePolicyData(input, effectiveTo),
      })
    : tx.employeePayrollPolicy.create({
        data: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          effectiveFrom,
          ...toEmployeePolicyData(input, effectiveTo),
        },
      });
}

export function statutoryName(code: string) {
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
