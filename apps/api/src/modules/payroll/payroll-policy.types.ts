import { Prisma } from '../../generated/prisma/client';
import { AccessMode } from '../../generated/prisma/enums';
import type {
  PayFrequency,
  PayrollRoundingMode,
  SalarySlipMode,
} from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';

export type PolicyInput = {
  effectiveFrom: string;
  effectiveTo?: string;
  salarySlipDefault: boolean;
  payrollEnabledDefault: boolean;
  payrollDayBasis: number;
  basePercentage: number;
  baseMinimum: number;
  hraPercentage: number;
  pfDefault: boolean;
  esiDefault: boolean;
  ptDefault: boolean;
  statutoryJurisdiction?: string;
  roundingMode: PayrollRoundingMode;
};

export type EmployeePolicyInput = {
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  payrollEnabled: boolean;
  salarySlipMode: SalarySlipMode;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  statutoryJurisdiction?: string;
};

export type SalaryProfileInput = EmployeePolicyInput & {
  grossSalary: number;
  payType: 'SALARY' | 'HOURLY' | 'DAILY' | 'PER_SHIFT';
  payFrequency: PayFrequency;
  overtimeMultiplier: number;
};

export type PreviewInput = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  payableDays?: number;
};

export type StatutoryRuleInput = {
  schemeCode: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo?: string;
  employeeRate?: number;
  employerRate?: number;
  wageCeiling?: number;
  employeeThreshold?: number;
  flatAmount?: number;
  metadata?: Record<string, unknown>;
};

export type AdvanceInput = {
  employeeId: string;
  amount: number;
  reason: string;
  externalId?: string;
};
export type AdvanceDecisionInput = {
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedAmount?: number;
  comment: string;
};
export type PaymentInput = {
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'UPI' | 'CHEQUE' | 'OTHER';
  paymentReference?: string;
};

export function toPolicyData(input: PolicyInput, effectiveTo: Date | null) {
  return {
    effectiveTo,
    salarySlipDefault: input.salarySlipDefault,
    payrollEnabledDefault: input.payrollEnabledDefault,
    payrollDayBasis: input.payrollDayBasis,
    basePercentage: new Prisma.Decimal(input.basePercentage),
    baseMinimum: new Prisma.Decimal(input.baseMinimum),
    hraPercentage: new Prisma.Decimal(input.hraPercentage),
    pfDefault: input.pfDefault,
    esiDefault: input.esiDefault,
    ptDefault: input.ptDefault,
    statutoryJurisdiction: input.statutoryJurisdiction?.trim().toUpperCase() || null,
    roundingMode: input.roundingMode,
  };
}

export function toEmployeePolicyData(input: EmployeePolicyInput, effectiveTo: Date | null) {
  return {
    effectiveTo,
    payrollEnabled: input.payrollEnabled,
    salarySlipMode: input.salarySlipMode,
    pfEnabled: input.pfEnabled,
    esiEnabled: input.esiEnabled,
    ptEnabled: input.ptEnabled,
    statutoryJurisdiction: input.statutoryJurisdiction?.trim().toUpperCase() || null,
  };
}

export function validatePolicy(input: PolicyInput) {
  if (
    !Number.isInteger(input.payrollDayBasis) ||
    input.payrollDayBasis < 1 ||
    input.payrollDayBasis > 31
  )
    throw new ConflictError('Payroll day basis must be between 1 and 31');
  if (
    !Number.isFinite(input.baseMinimum) ||
    !Number.isFinite(input.basePercentage) ||
    !Number.isFinite(input.hraPercentage) ||
    input.baseMinimum < 0 ||
    input.basePercentage < 0 ||
    input.basePercentage > 100 ||
    input.hraPercentage < 0 ||
    input.hraPercentage > 100
  )
    throw new ConflictError('Salary structure percentages and minimum must be valid');
}

export function validateStatutoryRule(input: StatutoryRuleInput) {
  for (const value of [
    input.employeeRate,
    input.employerRate,
    input.wageCeiling,
    input.employeeThreshold,
    input.flatAmount,
  ]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      throw new ConflictError('Statutory rule values must be finite and non-negative');
  }
  if (input.metadata !== undefined && !isStatutoryMetadata(input.metadata))
    throw new ConflictError('Statutory rule metadata must contain valid slabs');
}

function isStatutoryMetadata(metadata: Record<string, unknown>) {
  const slabs = metadata.slabs;
  if (slabs === undefined) return true;
  if (!Array.isArray(slabs)) return false;
  return slabs.every((slab) => {
    if (!slab || typeof slab !== 'object' || Array.isArray(slab)) return false;
    const value = slab as Record<string, unknown>;
    return (
      isNonNegativeNumber(value.min) &&
      (value.max === null || value.max === undefined || isNonNegativeNumber(value.max)) &&
      isNonNegativeNumber(value.amount) &&
      (value.max === null || value.max === undefined || Number(value.max) >= Number(value.min))
    );
  });
}

function isNonNegativeNumber(value: unknown) {
  return (
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  );
}

export function canReadAll(context: DomainContext, permission: string) {
  return context.permissions.has('*') || context.permissions.has(permission);
}

export function canReadRequestedEmployee(context: DomainContext, permission: string) {
  return context.accessMode === AccessMode.FEDERATION || canReadAll(context, permission);
}

export function dateOnly(value: string) {
  const valueOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueOnly);
  const date = new Date(`${valueOnly}T00:00:00.000Z`);
  if (
    !match ||
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}
