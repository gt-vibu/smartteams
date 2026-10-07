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
  return Math.max(1, count);
}

/**
 * Days within the period that the employee was not employed for.
 *
 * `payrollDayBasis` is a fixed monthly divisor (30 by default), the standard Indian convention:
 * every unpaid day costs one thirtieth of gross, and weekends and holidays are already priced into
 * the basis rather than counted. Employment dates were not part of that sum, so somebody who
 * joined on the 16th was paid for the whole month.
 *
 * A day before joining or after leaving is unpaid for the same reason an unpaid leave day is: the
 * employee was not owed salary for it. Counting it here applies the existing convention rather
 * than introducing a second one.
 */
export function unemployedDays(
  periodStart: Date,
  periodEnd: Date,
  dateOfJoining: Date | null,
  dateOfLeaving: Date | null,
) {
  const dayMs = 86_400_000;
  const inclusiveDays = (from: Date, to: Date) =>
    Math.max(0, Math.floor((to.getTime() - from.getTime()) / dayMs) + 1);

  let days = 0;
  if (dateOfJoining && dateOfJoining > periodStart) {
    // Days from the start of the period up to the day before joining.
    const lastUnpaid = new Date(Math.min(dateOfJoining.getTime() - dayMs, periodEnd.getTime()));
    days += inclusiveDays(periodStart, lastUnpaid);
  }
  if (dateOfLeaving && dateOfLeaving < periodEnd) {
    // Days from the day after leaving to the end of the period.
    const firstUnpaid = new Date(Math.max(dateOfLeaving.getTime() + dayMs, periodStart.getTime()));
    days += inclusiveDays(firstUnpaid, periodEnd);
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
    requestedDays: Prisma.Decimal;
    startDate?: Date;
    endDate?: Date;
    leaveType: { paid: boolean };
  }>,
  periodStart?: Date,
  periodEnd?: Date,
) {
  return requests.reduce(
    (summary, request) => {
      const days = proratedLeaveDays(request, periodStart, periodEnd);
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
    startDate?: Date;
    endDate?: Date;
  },
  periodStart?: Date,
  periodEnd?: Date,
) {
  const requestedDays = Number(request.requestedDays);
  if (!periodStart || !periodEnd || !request.startDate || !request.endDate) return requestedDays;
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

export function summarizeAttendance(
  records: Array<{ dayStatus: string; workDate?: Date }>,
  options?: {
    periodStart: Date;
    periodEnd: Date;
    workWeekDays: number[];
    holidays: Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }>;
    branchId: string | null;
    leaves: Array<{ startDate: Date; endDate: Date }>;
    /** Optional holidays this employee chose; the rest of the optional list are working days. */
    employeeSelectedDates?: readonly string[];
    /** Days outside employment are priced as unemployed days, so they are not also absences. */
    dateOfJoining?: Date | null;
    dateOfLeaving?: Date | null;
  },
) {
  const summary = records.reduce(
    (summary, record) => {
      if (record.dayStatus === 'ABSENT') summary.absentDays += 1;
      if (record.dayStatus === 'HALF_DAY') summary.halfDays += 1;
      return summary;
    },
    { absentDays: 0, halfDays: 0 },
  );
  if (!options) return summary;

  const recordedDates = new Set(
    records
      .map((record) => record.workDate?.toISOString().slice(0, 10))
      .filter((value): value is string => Boolean(value)),
  );
  const holidayDates = new Set(
    options.holidays
      .filter(
        (holiday) =>
          (holiday.branchId === null || holiday.branchId === options.branchId) &&
          !holiday.isOptional,
      )
      .map((holiday) => holiday.holidayDate.toISOString().slice(0, 10)),
  );
  for (const date of options.employeeSelectedDates ?? []) holidayDates.add(date);
  const joined = options.dateOfJoining?.toISOString().slice(0, 10);
  const left = options.dateOfLeaving?.toISOString().slice(0, 10);
  const leaveDates = new Set<string>();
  for (const leave of options.leaves) {
    const start = new Date(Math.max(leave.startDate.getTime(), options.periodStart.getTime()));
    const end = new Date(Math.min(leave.endDate.getTime(), options.periodEnd.getTime()));
    for (const date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1))
      leaveDates.add(date.toISOString().slice(0, 10));
  }
  for (const record of records) {
    const dateKey = record.workDate?.toISOString().slice(0, 10);
    if (!dateKey || !leaveDates.has(dateKey)) continue;
    if (record.dayStatus === 'ABSENT') summary.absentDays -= 1;
    if (record.dayStatus === 'HALF_DAY') summary.halfDays -= 1;
  }
  for (
    const date = new Date(options.periodStart);
    date <= options.periodEnd;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const dateKey = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (
      options.workWeekDays.includes(weekday) &&
      !holidayDates.has(dateKey) &&
      !recordedDates.has(dateKey) &&
      !leaveDates.has(dateKey) &&
      (!joined || dateKey >= joined) &&
      (!left || dateKey <= left)
    )
      summary.absentDays += 1;
  }
  return summary;
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
