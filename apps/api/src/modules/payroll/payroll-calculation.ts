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
  holidays: Array<{ holidayDate: Date; branchId: string | null }>,
  branchId: string | null,
) {
  const holidayDates = new Set(
    holidays
      .filter((holiday) => holiday.branchId === null || holiday.branchId === branchId)
      .map((holiday) => holiday.holidayDate.toISOString().slice(0, 10)),
  );
  let count = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (workWeekDays.includes(weekday) && !holidayDates.has(date.toISOString().slice(0, 10)))
      count += 1;
  }
  return Math.max(1, count);
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
  requests: Array<{ requestedDays: Prisma.Decimal; leaveType: { paid: boolean } }>,
) {
  return requests.reduce(
    (summary, request) => {
      const days = Number(request.requestedDays);
      if (request.leaveType.paid) summary.paidDays += days;
      else summary.unpaidDays += days;
      return summary;
    },
    { paidDays: 0, unpaidDays: 0 },
  );
}

export function calculateComponent(
  assignment: {
    amount: Prisma.Decimal | null;
    percentage: Prisma.Decimal | null;
    component: { calculationType: PayComponentCalculationType; formulaDefinition: unknown };
  },
  base: Prisma.Decimal,
) {
  if (assignment.component.calculationType === PayComponentCalculationType.FIXED)
    return assignment.amount ?? new Prisma.Decimal(0);
  if (assignment.component.calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE)
    return base.mul(assignment.percentage ?? 0).div(100);
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
    DRAFT: [PayrollRunStatus.CALCULATED],
    CALCULATED: [PayrollRunStatus.APPROVED],
    APPROVED: [PayrollRunStatus.RELEASED],
    RELEASED: [PayrollRunStatus.LOCKED],
    LOCKED: [],
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
        : 'payroll.runs.lock';
}
