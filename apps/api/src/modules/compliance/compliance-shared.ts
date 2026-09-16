import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { NotFoundError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { ComplianceRecordStatus } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';

/**
 * Constants and pure rules the services in this module share.
 *
 * Extracted so no service has to depend on another merely to reach a lookup table or a
 * validator.
 */

export type ProfileInput = {
  schemeCode: string;
  registrationNumber?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  employeeRate?: number;
  employerRate?: number;
  metadata?: Record<string, unknown>;
};
export type RecordInput = {
  schemeCode: string;
  periodStart: string;
  periodEnd: string;
  status?: ComplianceRecordStatus;
  employeeAmount?: number;
  employerAmount?: number;
  dueDate?: string;
  filingReference?: string;
  metadata?: Record<string, unknown>;
};

export const STATUTORY_SCHEME_CATALOG = [
  {
    code: 'EPF_IN',
    name: 'Employees’ Provident Fund (India)',
    jurisdiction: 'IN',
    employeeRatePercent: 12,
    employerRatePercent: 12,
    wageCeiling: 15000,
    requiresRegistration: true,
    notes:
      'Baseline contribution reference. EPS, EDLI, administrative charges, and higher-wage options require payroll rules for the establishment.',
  },
  {
    code: 'ESI_IN',
    name: 'Employees’ State Insurance (India)',
    jurisdiction: 'IN',
    employeeRatePercent: 0.75,
    employerRatePercent: 3.25,
    wageCeiling: 21000,
    requiresRegistration: true,
    notes: 'Contribution eligibility and wage ceiling must be evaluated for each pay period.',
  },
  {
    code: 'PT_IN',
    name: 'Professional Tax (India)',
    jurisdiction: 'IN',
    employeeRatePercent: null,
    employerRatePercent: null,
    wageCeiling: null,
    requiresRegistration: true,
    notes: 'Rates, slabs, exemptions, and return cadence are state-specific.',
  },
  {
    code: 'TDS_IN',
    name: 'Salary TDS (India)',
    jurisdiction: 'IN',
    employeeRatePercent: null,
    employerRatePercent: null,
    wageCeiling: null,
    requiresRegistration: true,
    notes:
      'Tax regime, declarations, deductions, exemptions, and annualised payroll determine withholding.',
  },
] as const;

export function dateOnly(value: string) {
  const result = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) || Number.isNaN(result.getTime()))
    throw new ConflictError('Invalid calendar date');
  return result;
}

export function validateMetadata(metadata: Record<string, unknown>) {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 32_768) throw new ConflictError('Compliance metadata is too large');
  return metadata;
}

export function validateAmounts(employeeAmount?: number, employerAmount?: number) {
  for (const amount of [employeeAmount, employerAmount]) {
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      throw new ConflictError('Compliance amounts must be finite and non-negative');
    }
  }
}

export function assertComplianceTransition(
  current: ComplianceRecordStatus | undefined,
  next: ComplianceRecordStatus,
) {
  if (!current) return;
  if (current === ComplianceRecordStatus.ACCEPTED) {
    throw new ConflictError('Accepted compliance records are immutable');
  }
  if (current === next) return;
  const allowed: Record<ComplianceRecordStatus, readonly ComplianceRecordStatus[]> = {
    [ComplianceRecordStatus.DRAFT]: [ComplianceRecordStatus.READY, ComplianceRecordStatus.REJECTED],
    [ComplianceRecordStatus.READY]: [
      ComplianceRecordStatus.SUBMITTED,
      ComplianceRecordStatus.REJECTED,
    ],
    [ComplianceRecordStatus.SUBMITTED]: [
      ComplianceRecordStatus.ACCEPTED,
      ComplianceRecordStatus.REJECTED,
    ],
    [ComplianceRecordStatus.ACCEPTED]: [],
    [ComplianceRecordStatus.REJECTED]: [ComplianceRecordStatus.DRAFT, ComplianceRecordStatus.READY],
  };
  if (!allowed[current].includes(next)) {
    throw new ConflictError(`Compliance record cannot transition from ${current} to ${next}`);
  }
}

export async function assertEmployee(
  tx: Parameters<Parameters<TenantDatabaseService['run']>[1]>[0],
  context: DomainContext,
  employeeId: string,
) {
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: context.organizationId,
      ...employeeScope(context),
    },
    select: { id: true },
  });
  if (!employee) throw new NotFoundError('Employee');
}

export function employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
  return context.branchId
    ? {
        OR: [
          { primaryBranchId: context.branchId },
          { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
        ],
      }
    : {};
}
