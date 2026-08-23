import { Prisma } from '../../generated/prisma/client';
import { PayrollRoundingMode } from '../../generated/prisma/enums';

export type SalaryStructurePolicy = {
  basePercentage: Prisma.Decimal | number | string;
  baseMinimum: Prisma.Decimal | number | string;
  hraPercentage: Prisma.Decimal | number | string;
  roundingMode: PayrollRoundingMode;
};

export type SalaryStructure = {
  gross: Prisma.Decimal;
  base: Prisma.Decimal;
  hra: Prisma.Decimal;
  otherAllowance: Prisma.Decimal;
};

export type StatutoryRuleInput = {
  schemeCode: string;
  employeeRate: Prisma.Decimal | number | string | null;
  employerRate: Prisma.Decimal | number | string | null;
  wageCeiling: Prisma.Decimal | number | string | null;
  employeeThreshold: Prisma.Decimal | number | string | null;
  flatAmount?: Prisma.Decimal | number | string | null;
  metadata: unknown;
};

export type StatutoryResult = {
  schemeCode: string;
  employeeAmount: Prisma.Decimal;
  employerAmount: Prisma.Decimal;
  basis: Prisma.Decimal;
  eligible: boolean;
  reason: string;
};

export function calculateSalaryStructure(
  grossInput: Prisma.Decimal | number | string,
  policy: SalaryStructurePolicy,
): SalaryStructure {
  const gross = money(grossInput);
  if (gross.isNegative()) throw new Error('Gross salary must be non-negative');

  const percentageBase = gross.mul(decimal(policy.basePercentage)).div(100);
  const base = roundMoney(
    Prisma.Decimal.min(gross, Prisma.Decimal.max(percentageBase, decimal(policy.baseMinimum))),
    policy.roundingMode,
  );
  const eligibleHra = base.mul(decimal(policy.hraPercentage)).div(100);
  const hra = roundMoney(Prisma.Decimal.min(eligibleHra, gross.minus(base)), policy.roundingMode);
  const otherAllowance = roundMoney(gross.minus(base).minus(hra), policy.roundingMode);

  return { gross: roundMoney(gross, policy.roundingMode), base, hra, otherAllowance };
}

export function prorateSalaryStructure(
  structure: SalaryStructure,
  payableDays: Prisma.Decimal | number,
  dayBasis: number,
  roundingMode: PayrollRoundingMode,
): SalaryStructure {
  if (!Number.isInteger(dayBasis) || dayBasis <= 0)
    throw new Error('Payroll day basis must be positive');
  const days = decimal(payableDays);
  const ratio = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    Prisma.Decimal.min(new Prisma.Decimal(1), days.div(dayBasis)),
  );
  const gross = roundMoney(structure.gross.mul(ratio), roundingMode);
  const base = roundMoney(structure.base.mul(ratio), roundingMode);
  const hra = roundMoney(structure.hra.mul(ratio), roundingMode);
  const otherAllowance = roundMoney(gross.minus(base).minus(hra), roundingMode);
  return { gross, base, hra, otherAllowance };
}

export function calculateStatutoryDeduction(
  structure: SalaryStructure,
  rule: StatutoryRuleInput,
  roundingMode: PayrollRoundingMode,
  eligibilityStructure = structure,
): StatutoryResult {
  const scheme = rule.schemeCode.toUpperCase();
  const rate = decimal(rule.employeeRate ?? 0);
  const employerRate = decimal(rule.employerRate ?? 0);
  const threshold = rule.employeeThreshold === null ? null : decimal(rule.employeeThreshold);
  const ceiling = rule.wageCeiling === null ? null : decimal(rule.wageCeiling);

  if (scheme === 'PT' || scheme === 'PROFESSIONAL_TAX') {
    if (threshold && eligibilityStructure.gross.lessThan(threshold)) {
      return {
        schemeCode: scheme,
        employeeAmount: zero(),
        employerAmount: zero(),
        basis: structure.gross,
        eligible: false,
        reason: 'Employee wage is below the configured professional-tax threshold',
      };
    }
    const slabAmount = metadataSlabAmount(rule.metadata, eligibilityStructure.gross);
    const flatAmount =
      slabAmount ??
      (rule.flatAmount === null || rule.flatAmount === undefined
        ? metadataNumber(rule.metadata, 'flatAmount')
        : Number(rule.flatAmount));
    const amount =
      flatAmount === null ? structure.gross.mul(rate).div(100) : new Prisma.Decimal(flatAmount);
    return {
      schemeCode: scheme,
      employeeAmount: roundMoney(amount, roundingMode),
      employerAmount: zero(),
      basis: structure.gross,
      eligible: amount.greaterThan(0),
      reason: 'Professional tax rule applied for the configured jurisdiction',
    };
  }

  if (threshold && eligibilityStructure.gross.greaterThan(threshold)) {
    return {
      schemeCode: scheme,
      employeeAmount: zero(),
      employerAmount: zero(),
      basis: zero(),
      eligible: false,
      reason: 'Employee wage is above the configured coverage threshold',
    };
  }

  const wageBasis = scheme === 'EPF' || scheme === 'PF' ? structure.base : structure.gross;
  const basis = ceiling ? Prisma.Decimal.min(wageBasis, ceiling) : wageBasis;
  const employeeAmount = roundMoney(basis.mul(rate).div(100), roundingMode);
  const employerAmount = roundMoney(basis.mul(employerRate).div(100), roundingMode);
  return {
    schemeCode: scheme,
    employeeAmount,
    employerAmount,
    basis,
    eligible: employeeAmount.greaterThan(0),
    reason: `${scheme} contribution applied to the configured wage basis`,
  };
}

export function allocateAdvanceRecovery(
  approvedAmount: Prisma.Decimal | number | string,
  recoveredAmount: Prisma.Decimal | number | string,
  availableNetPay: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const remaining = Prisma.Decimal.max(zero(), money(approvedAmount).minus(money(recoveredAmount)));
  return roundMoney(
    Prisma.Decimal.min(remaining, Prisma.Decimal.max(zero(), money(availableNetPay))),
    PayrollRoundingMode.HALF_UP,
  );
}

export function roundMoney(value: Prisma.Decimal, mode: PayrollRoundingMode) {
  if (mode === PayrollRoundingMode.DOWN) return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  if (mode === PayrollRoundingMode.UP) return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function decimal(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal | number | string) {
  return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function zero() {
  return new Prisma.Decimal(0);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function metadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function metadataSlabAmount(metadata: unknown, gross: Prisma.Decimal) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const slabs = (metadata as Record<string, unknown>).slabs;
  if (!isUnknownArray(slabs)) return null;
  const slab = slabs.find((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const min = Number(record.min);
    const max = record.max === null || record.max === undefined ? null : Number(record.max);
    return (
      Number.isFinite(min) &&
      min >= 0 &&
      (max === null || (Number.isFinite(max) && max >= min)) &&
      gross.greaterThanOrEqualTo(min) &&
      (max === null || gross.lessThanOrEqualTo(max))
    );
  });
  if (!slab || typeof slab !== 'object' || Array.isArray(slab)) return null;
  const amount = Number((slab as Record<string, unknown>).amount);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
