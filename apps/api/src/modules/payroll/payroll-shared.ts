import { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Small shared pieces of the payroll module.
 *
 * These were private methods and file-local functions on a single 1539-line service. They are
 * here because more than one of the services that replaced it needs them, and duplicating a
 * branch-scoping rule or a JSON reader across five files is how two copies of the same rule end
 * up disagreeing.
 */

/**
 * Restricts a query to the branch the caller is acting for.
 *
 * An empty object rather than a filter when there is no branch: the caller is acting for the
 * whole organization, and tenant scoping is applied separately and always.
 */
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

/** Whether a payslip may show its full breakdown, per the policy frozen into its snapshot. */
export function detailedSalarySlipAllowed(snapshot: Prisma.JsonValue) {
  if (!isRecord(snapshot)) return true;
  const employeePolicy = isRecord(snapshot.employeePolicy) ? snapshot.employeePolicy : null;
  if (employeePolicy?.salarySlipMode === 'DISABLED') return false;
  const policy = isRecord(snapshot.policy) ? snapshot.policy : null;
  return policy?.salarySlipDefault !== false;
}

export function endOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

export function decimalFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Prisma.Decimal(value);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return new Prisma.Decimal(value);
  }
  return new Prisma.Decimal(0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateCalendarMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new ConflictError('Payroll calendar year is invalid');
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new ConflictError('Payroll calendar month is invalid');
}

export function encodePayrollCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

export function decodePayrollCursor(cursor: string) {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !value.id
    ) {
      throw new Error('invalid');
    }
    return value.id;
  } catch {
    throw new ConflictError('Payroll ledger cursor is invalid or expired');
  }
}
