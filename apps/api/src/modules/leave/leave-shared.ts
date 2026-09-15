import { Prisma } from '../../generated/prisma/client';
import type { LeaveAccrualType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';

/**
 * Pure leave rules and shapes: scoping, periods, entitlement, cursors and DTOs.
 *
 * These were private methods on a 1215-line service. Every one of them already took the data it
 * needed as an argument rather than reading it off `this`, so they were functions in all but
 * declaration — which is why four separate services could be carved out of that file without any
 * of them having to call each other.
 */

export function canReadAllEmployees(context: DomainContext, readAllPermission: string) {
  return (
    context.accessMode === 'FEDERATION' ||
    context.permissions.has('*') ||
    context.permissions.has(readAllPermission)
  );
}

export function selfEmployee(tx: Prisma.TransactionClient, context: DomainContext) {
  return tx.employee.findFirst({
    where: { organizationId: context.organizationId, userId: context.actor.userId },
    select: { id: true },
  });
}

export function employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
  return {
    OR: [
      { primaryBranchId: context.branchId },
      { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
    ],
  };
}

export function leavePeriod(date: Date, leaveYearStartMonth: number) {
  const periodStart = new Date(
    Date.UTC(
      date.getUTCFullYear() - (date.getUTCMonth() + 1 < leaveYearStartMonth ? 1 : 0),
      leaveYearStartMonth - 1,
      1,
    ),
  );
  return {
    periodStart,
    periodEnd: new Date(Date.UTC(periodStart.getUTCFullYear() + 1, leaveYearStartMonth - 1, 0)),
  };
}

export function initialEntitlement(
  type: {
    accrualType: LeaveAccrualType;
    annualAllowance: Prisma.Decimal | null;
    monthlyAccrual: Prisma.Decimal | null;
  },
  periodStart: Date,
  date: Date,
) {
  if (type.accrualType === 'FIXED_ANNUAL') return type.annualAllowance ?? new Prisma.Decimal(0);
  if (type.accrualType === 'MONTHLY') {
    const months =
      (date.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 +
      date.getUTCMonth() -
      periodStart.getUTCMonth() +
      1;
    return (type.monthlyAccrual ?? new Prisma.Decimal(0)).mul(months);
  }
  return new Prisma.Decimal(0);
}

/**
 * Employee self-scoping, matching the convention already used by Timesheets, Compliance and
 * Payroll: a plain `read` permission may only see the caller's own records, `<permission>.all`
 * (or the tenant wildcard) may read other employees, and federation grants keep the read
 * breadth their scope already carries.
 */

export function toTypeDto(type: {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  accrualType: string;
  annualAllowance: unknown;
  monthlyAccrual: unknown;
  carryoverLimit: unknown;
  requiresAttachment: boolean;
  isActive: boolean;
}) {
  return {
    id: type.id,
    code: type.code,
    name: type.name,
    paid: type.paid,
    accrualType: type.accrualType,
    annualAllowance: type.annualAllowance,
    monthlyAccrual: type.monthlyAccrual,
    carryoverLimit: type.carryoverLimit,
    requiresAttachment: type.requiresAttachment,
    isActive: type.isActive,
  };
}

export function toRequestDto(
  request: {
    id: string;
    organizationId: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    requestedDays: unknown;
    status: string;
    version: number;
  },
  days = Number(request.requestedDays),
) {
  return {
    id: request.id,
    organizationId: request.organizationId,
    employeeId: request.employeeId,
    leaveTypeId: request.leaveTypeId,
    startDate: request.startDate,
    endDate: request.endDate,
    requestedDays: days,
    status: request.status,
    version: request.version,
  };
}

export function encodeLeaveCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

export function decodeLeaveCursor(cursor: string) {
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
    throw new ConflictError('Leave request cursor is invalid or expired');
  }
}

export function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}
export function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
