import { Prisma } from '../../generated/prisma/client';
import type { PayComponentType } from '../../generated/prisma/enums';
import { PayComponentCalculationType } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';
import { decimalFromUnknown, isRecord } from './payroll-shared';

/**
 * What makes a pay component definition acceptable, and how an employee's assigned components
 * merge with the catalogue.
 *
 * Pure rules, no database. They were file-local functions inside the payroll service; on their
 * own they are the part of payroll a reviewer is most likely to want to read in isolation,
 * because getting them wrong changes what people are paid.
 */

/** The shape a caller supplies when defining or editing a pay component. */
export type ComponentInput = {
  code: string;
  name: string;
  componentType: PayComponentType;
  calculationType: PayComponentCalculationType;
  formulaDefinition?: unknown;
  isTaxable: boolean;
  displayOrder?: number;
};

export function isSupportedFormula(
  value: unknown,
): value is { operation: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { operation?: unknown; value?: unknown };
  return (
    (candidate.operation === 'FIXED' || candidate.operation === 'PERCENTAGE_OF_BASE') &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    candidate.value >= 0 &&
    (candidate.operation === 'PERCENTAGE_OF_BASE' ? candidate.value <= 100 : true)
  );
}

export function validateComponentInput(input: ComponentInput) {
  if (!input.code.trim() || !input.name.trim())
    throw new ConflictError('Pay component code and name are required');
  if (input.formulaDefinition !== undefined && !isSupportedFormula(input.formulaDefinition))
    throw new ConflictError('Pay component values require a supported formula definition');
  if (
    input.formulaDefinition !== undefined &&
    input.calculationType !== PayComponentCalculationType.FORMULA &&
    !matchesCalculationType(input.calculationType, input.formulaDefinition)
  )
    throw new ConflictError('Pay component value does not match its calculation type');
  if (
    input.calculationType === PayComponentCalculationType.FORMULA &&
    input.formulaDefinition === undefined
  )
    throw new ConflictError('Formula pay components require a supported formula definition');
}

export function matchesCalculationType(
  calculationType: PayComponentCalculationType,
  formula: { operation: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: number },
) {
  return (
    (calculationType === PayComponentCalculationType.FIXED && formula.operation === 'FIXED') ||
    (calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE &&
      formula.operation === 'PERCENTAGE_OF_BASE')
  );
}

export function hasDefaultValue(value: unknown, operation: 'FIXED' | 'PERCENTAGE_OF_BASE') {
  return isSupportedFormula(value) && value.operation === operation;
}

export function mergeSalaryComponents(
  components: Array<{
    componentCode: string;
    componentName: string;
    componentType: string;
    amount: Prisma.Decimal;
  }>,
  breakdown: Prisma.JsonValue,
) {
  const existingCodes = new Set(
    components.map((component) => component.componentCode.toUpperCase()),
  );
  const structure =
    isRecord(breakdown) && isRecord(breakdown.proratedStructure)
      ? breakdown.proratedStructure
      : null;
  const extraEarnings = components
    .filter((component) => component.componentType === 'EARNING')
    .filter(
      (component) =>
        !['BASE', 'BASIC', 'HRA', 'OTHER_ALLOWANCE'].includes(
          component.componentCode.toUpperCase(),
        ),
    )
    .reduce((sum, component) => sum.add(component.amount), new Prisma.Decimal(0));
  const computedCandidates: Array<[string, string, Prisma.Decimal]> = structure
    ? [
        ['BASE', 'Base salary', decimalFromUnknown(structure.base)],
        ['HRA', 'HRA', decimalFromUnknown(structure.hra)],
        [
          'OTHER_ALLOWANCE',
          'Other allowance',
          decimalFromUnknown(structure.otherAllowance).sub(extraEarnings),
        ],
      ]
    : [];
  const computed = computedCandidates
    .filter(([code]) => !existingCodes.has(code.toUpperCase()))
    .map(([code, name, amount]) => ({
      componentCode: code,
      componentName: name,
      componentType: 'EARNING',
      amount,
    }));
  const statutory =
    isRecord(breakdown) && Array.isArray(breakdown.statutory)
      ? breakdown.statutory
          .map((entry) => {
            if (!isRecord(entry) || typeof entry.schemeCode !== 'string') return null;
            const code = entry.schemeCode.toUpperCase();
            if (existingCodes.has(code)) return null;
            const name =
              code === 'EPF' || code === 'PF'
                ? 'EPF'
                : code === 'ESIC'
                  ? 'ESI'
                  : code === 'PT' || code === 'PROFESSIONAL_TAX'
                    ? 'Professional tax'
                    : code;
            return {
              componentCode: code,
              componentName: name,
              componentType: 'DEDUCTION',
              amount: decimalFromUnknown(entry.employeeAmount),
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [];
  return [...components, ...computed, ...statutory];
}
