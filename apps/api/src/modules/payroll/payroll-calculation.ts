export { summarizeAttendance } from './payroll-attendance-summary';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PayComponentCalculationType, PayrollRunStatus } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';

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

/**
 * Payroll may be calculated before a period closes. Only completed dates can incur absence
 * deductions; today's attendance is still in progress, and dates after today have not happened.
 * Leave is measured through today because an approved leave scheduled for today is known.
 */
export function payrollPeriodCutoffs(periodStart: Date, periodEnd: Date, now = new Date()) {
  const today = dateOnly(now.toISOString());
  const measuredEnd = today < periodEnd ? today : periodEnd;
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const absenceEnd = yesterday < periodEnd ? yesterday : periodEnd;
  return { measuredEnd, absenceEnd: absenceEnd < periodStart ? null : absenceEnd };
}

export function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function emptyHash() {
  return hash([]);
}

export function countWorkingDays(
  start: Date,
  end: Date,
  workWeekDays: number[],
  holidays: Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }>,
  branchId: string | null,
  employeeSelectedDates?: Set<string> | string[],
) {
  const holidayDates = new Set(
    holidays
      .filter(
        (holiday) =>
          (holiday.branchId === null || holiday.branchId === branchId) && !holiday.isOptional,
      )
      .map((holiday) => holiday.holidayDate.toISOString().slice(0, 10)),
  );
  if (employeeSelectedDates) {
    for (const d of employeeSelectedDates) holidayDates.add(d);
  }
  let count = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (workWeekDays.includes(weekday) && !holidayDates.has(date.toISOString().slice(0, 10)))
      count += 1;
  }
  return count;
}

/**
 * Monthly salary coverage expressed as a fraction of a normal monthly work calendar.
 * A one-day off-cycle run on a normal weekday therefore covers one workday out of the month's
 * scheduled days; a complete calendar month covers exactly one monthly salary period.
 */
export function monthlyWorkdayUnits(
  start: Date,
  end: Date,
  workWeekDays: number[],
  holidays: Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }>,
  branchId: string | null,
  employeeSelectedDates?: Set<string> | string[],
) {
  let units = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowStart = start > monthStart ? start : monthStart;
    const windowEnd = end < monthEnd ? end : monthEnd;
    const monthWorkdays = countWorkingDays(
      monthStart,
      monthEnd,
      workWeekDays,
      holidays,
      branchId,
      employeeSelectedDates,
    );
    if (monthWorkdays > 0) {
      units +=
        countWorkingDays(
          windowStart,
          windowEnd,
          workWeekDays,
          holidays,
          branchId,
          employeeSelectedDates,
        ) / monthWorkdays;
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return units;
}

/**
 * Optional holidays are paid non-working days only while the employee stays within the
 * organization (or employee-specific) annual allowance. Selection order is stable so historical
 * runs can be recalculated consistently when multiple selections exist.
 */
export function eligibleOptionalHolidayDates(
  selections: Array<{
    employeeId: string;
    year: number;
    selectedAt: Date;
    id: string;
    holiday: { holidayDate: Date };
  }>,
  allowanceForEmployee: (employeeId: string) => number,
) {
  const usedByEmployeeYear = new Map<string, number>();
  const eligibleByEmployee = new Map<string, string[]>();
  const ordered = selections
    .slice()
    .sort(
      (a, b) =>
        a.year - b.year ||
        a.employeeId.localeCompare(b.employeeId) ||
        a.selectedAt.getTime() - b.selectedAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  for (const selection of ordered) {
    const bucket = `${selection.employeeId}:${selection.year}`;
    const used = usedByEmployeeYear.get(bucket) ?? 0;
    if (used >= Math.max(0, allowanceForEmployee(selection.employeeId))) continue;
    usedByEmployeeYear.set(bucket, used + 1);
    const dates = eligibleByEmployee.get(selection.employeeId) ?? [];
    dates.push(selection.holiday.holidayDate.toISOString().slice(0, 10));
    eligibleByEmployee.set(selection.employeeId, dates);
  }
  return eligibleByEmployee;
}

/**
 * Days within the period that the employee was not employed for.
 *
 * Only scheduled workdays reduce salary. Weekend days, organization holidays, and optional
 * holidays within the employee's allowance are not payable workdays and are never counted as
 * unpaid days outside employment.
 */
export function unemployedDays(
  periodStart: Date,
  periodEnd: Date,
  dateOfJoining: Date | null,
  dateOfLeaving: Date | null,
  workWeekDays: number[] = [1, 2, 3, 4, 5, 6, 7],
  holidays: Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }> = [],
  branchId: string | null = null,
  employeeSelectedDates?: Set<string> | string[],
) {
  const dayMs = 86_400_000;
  let days = 0;
  if (dateOfJoining && dateOfJoining > periodStart) {
    const lastUnpaid = new Date(Math.min(dateOfJoining.getTime() - dayMs, periodEnd.getTime()));
    days += countWorkingDays(
      periodStart,
      lastUnpaid,
      workWeekDays,
      holidays,
      branchId,
      employeeSelectedDates,
    );
  }
  if (dateOfLeaving && dateOfLeaving < periodEnd) {
    const firstUnpaid = new Date(Math.max(dateOfLeaving.getTime() + dayMs, periodStart.getTime()));
    days += countWorkingDays(
      firstUnpaid,
      periodEnd,
      workWeekDays,
      holidays,
      branchId,
      employeeSelectedDates,
    );
  }
  return days;
}

export function sumTimesheets(entries: Array<{ regularMinutes: number; overtimeMinutes: number }>) {
  if (entries.length === 0) return null;
  return entries.reduce(
    (summary, entry) => ({
      regularMinutes: summary.regularMinutes + entry.regularMinutes,
      overtimeMinutes: summary.overtimeMinutes + entry.overtimeMinutes,
    }),
    { regularMinutes: 0, overtimeMinutes: 0 },
  );
}

export function summarizeLeave(
  requests: Array<{
    id?: string;
    requestedDays: Prisma.Decimal;
    session?: string;
    chargedDates?: Prisma.JsonValue | null;
    startDate?: Date;
    endDate?: Date;
    leaveType: { paid: boolean };
  }>,
  periodStart?: Date,
  periodEnd?: Date,
  acceptedOverlapUnits: ReadonlyMap<string, number> = new Map(),
) {
  return requests.reduce(
    (summary, request) => {
      const days = Math.max(
        0,
        proratedLeaveDays(request, periodStart, periodEnd) -
          (request.id ? (acceptedOverlapUnits.get(request.id) ?? 0) : 0),
      );
      if (request.leaveType.paid) summary.paidDays += days;
      else summary.unpaidDays += days;
      return summary;
    },
    { paidDays: 0, unpaidDays: 0 },
  );
}

function proratedLeaveDays(
  request: {
    requestedDays: Prisma.Decimal;
    session?: string;
    chargedDates?: Prisma.JsonValue | null;
    startDate?: Date;
    endDate?: Date;
  },
  periodStart?: Date,
  periodEnd?: Date,
) {
  const requestedDays = Number(request.requestedDays);
  if (!periodStart || !periodEnd || !request.startDate || !request.endDate) return requestedDays;
  if (Array.isArray(request.chargedDates)) {
    const from = periodStart.toISOString().slice(0, 10),
      to = periodEnd.toISOString().slice(0, 10);
    return (
      request.chargedDates.filter((date) => typeof date === 'string' && date >= from && date <= to)
        .length * (request.session && request.session !== 'FULL_DAY' ? 0.5 : 1)
    );
  }
  const start = Math.max(request.startDate.getTime(), periodStart.getTime());
  const end = Math.min(request.endDate.getTime(), periodEnd.getTime());
  if (end < start) return 0;
  const requestedRangeDays =
    Math.floor((request.endDate.getTime() - request.startDate.getTime()) / 86_400_000) + 1;
  const overlappingRangeDays = Math.floor((end - start) / 86_400_000) + 1;
  return requestedRangeDays > 0
    ? (requestedDays * overlappingRangeDays) / requestedRangeDays
    : requestedDays;
}

export function calculateComponent(
  assignment: {
    amount: Prisma.Decimal | null;
    percentage: Prisma.Decimal | null;
    component: { calculationType: PayComponentCalculationType; formulaDefinition: unknown };
  },
  base: Prisma.Decimal,
) {
  if (assignment.component.calculationType === PayComponentCalculationType.FIXED) {
    const defaultValue = formulaValue(assignment.component.formulaDefinition, 'FIXED');
    return assignment.amount ?? defaultValue ?? new Prisma.Decimal(0);
  }
  if (assignment.component.calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE) {
    const defaultValue = formulaValue(assignment.component.formulaDefinition, 'PERCENTAGE_OF_BASE');
    return base.mul(assignment.percentage ?? defaultValue ?? 0).div(100);
  }
  if (
    isFormula(assignment.component.formulaDefinition) &&
    assignment.component.formulaDefinition.operation === 'PERCENTAGE_OF_BASE'
  )
    return base.mul(assignment.component.formulaDefinition.value).div(100);
  if (
    isFormula(assignment.component.formulaDefinition) &&
    assignment.component.formulaDefinition.operation === 'FIXED'
  )
    return new Prisma.Decimal(assignment.component.formulaDefinition.value);
  throw new ConflictError('Unsupported payroll formula');
}

function formulaValue(value: unknown, operation: 'FIXED' | 'PERCENTAGE_OF_BASE') {
  if (!isFormula(value) || value.operation !== operation) return null;
  return new Prisma.Decimal(value.value);
}

function isFormula(
  value: unknown,
): value is { operation: 'PERCENTAGE_OF_BASE' | 'FIXED'; value: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { operation?: unknown; value?: unknown };
  return (
    (candidate.operation === 'PERCENTAGE_OF_BASE' || candidate.operation === 'FIXED') &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value)
  );
}

export function validTransition(current: PayrollRunStatus, target: PayrollRunStatus) {
  const transitions: Record<PayrollRunStatus, PayrollRunStatus[]> = {
    DRAFT: [PayrollRunStatus.CALCULATED, PayrollRunStatus.VOIDED],
    CALCULATED: [PayrollRunStatus.APPROVED, PayrollRunStatus.VOIDED],
    APPROVED: [PayrollRunStatus.RELEASED],
    // A released run is never edited. It can only be superseded by a correction run, which is
    // what moves it to CORRECTED — see `PayrollService.correct`. FR-38 requires the original and
    // the correction to survive as separate, auditable records, so neither is mutated.
    RELEASED: [PayrollRunStatus.LOCKED, PayrollRunStatus.CORRECTED],
    LOCKED: [PayrollRunStatus.CORRECTED],
    // Terminal. A correction chain grows forward by creating runs, never by reopening one.
    CORRECTED: [],
    VOIDED: [],
  };
  return transitions[current].includes(target);
}

export function payrollTransitionPermission(target: PayrollRunStatus) {
  return target === PayrollRunStatus.CALCULATED
    ? 'payroll.runs.calculate'
    : target === PayrollRunStatus.APPROVED
      ? 'payroll.runs.approve'
      : target === PayrollRunStatus.RELEASED
        ? 'payroll.runs.release'
        : target === PayrollRunStatus.CORRECTED
          ? 'payroll.runs.correct'
          : target === PayrollRunStatus.VOIDED
            ? 'payroll.runs.void'
            : 'payroll.runs.lock';
}
