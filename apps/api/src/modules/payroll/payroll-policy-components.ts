import type { PayComponent, Prisma } from '../../generated/prisma/client';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { ConflictError } from '../../common/errors/domain-error';
import { hasDefaultValue } from './payroll-component-rules';
import type { PolicyInput } from './payroll-policy.types';

type ComponentAssignment = {
  id: string;
  payComponentId: string;
  amount: Prisma.Decimal | null;
  percentage: Prisma.Decimal | null;
  payComponent: PayComponent;
};

export function policyComponentDefaults(policy: unknown): ComponentAssignment[] {
  if (!policy || typeof policy !== 'object' || !('components' in policy)) return [];
  return Array.isArray(policy.components) ? (policy.components as ComponentAssignment[]) : [];
}

/** Employee-specific assignments retain precedence over the selected policy's defaults. */
export function effectivePolicyComponents<T extends ComponentAssignment>(
  policyComponents: ComponentAssignment[],
  employeeComponents: T[],
) {
  const employeeIds = new Set(employeeComponents.map((entry) => entry.payComponentId));
  return [
    ...policyComponents.filter((entry) => !employeeIds.has(entry.payComponentId)),
    ...employeeComponents,
  ];
}

export async function validatePolicyComponents(
  tx: TenantTransaction,
  organizationId: string,
  assignments: NonNullable<PolicyInput['components']>,
) {
  if (new Set(assignments.map((entry) => entry.payComponentId)).size !== assignments.length)
    throw new ConflictError('A payroll policy cannot include the same component twice');
  const components = await tx.payComponent.findMany({
    where: {
      organizationId,
      id: { in: assignments.map((entry) => entry.payComponentId) },
      isActive: true,
    },
  });
  for (const entry of assignments) {
    const component = components.find((candidate) => candidate.id === entry.payComponentId);
    if (!component) throw new ConflictError('Payroll policy component is unavailable');
    if (entry.amount !== undefined && entry.percentage !== undefined)
      throw new ConflictError('A component cannot set both an amount and a percentage');
    if (entry.amount !== undefined && (!Number.isFinite(entry.amount) || entry.amount < 0))
      throw new ConflictError('Component amount must be non-negative');
    if (
      entry.percentage !== undefined &&
      (!Number.isFinite(entry.percentage) || entry.percentage < 0 || entry.percentage > 100)
    )
      throw new ConflictError('Component percentage must be between 0 and 100');
    if (
      component.calculationType === 'FIXED' &&
      (entry.percentage !== undefined ||
        (entry.amount === undefined && !hasDefaultValue(component.formulaDefinition, 'FIXED')))
    )
      throw new ConflictError('Fixed policy component requires an amount or a configured default');
    if (
      component.calculationType === 'PERCENTAGE_OF_BASE' &&
      (entry.amount !== undefined ||
        (entry.percentage === undefined &&
          !hasDefaultValue(component.formulaDefinition, 'PERCENTAGE_OF_BASE')))
    )
      throw new ConflictError(
        'Percentage policy component requires a percentage or a configured default',
      );
  }
}
