import type { Prisma } from '../../generated/prisma/client';
import { leaveUnitsOn } from '../leave/leave-units';

type Options = {
  periodStart: Date;
  periodEnd: Date;
  workWeekDays: number[];
  holidays: Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }>;
  branchId: string | null;
  shifts?: Array<{ startsOn: Date; endsOn: Date | null; shift: { daysOfWeek: number[] } }>;
  leaves: Array<{
    startDate: Date;
    endDate: Date;
    session?: string;
    chargedDates?: Prisma.JsonValue | null;
  }>;
  employeeSelectedDates?: readonly string[];
  skipNonworkingDays?: boolean;
  dateOfJoining?: Date | null;
  dateOfLeaving?: Date | null;
};

/** Price only the portion that is neither worked nor covered by approved leave. */
export function summarizeAttendance(
  records: Array<{
    dayStatus: string;
    workDate?: Date;
    workedMinutes?: number;
    scheduledMinutes?: number | null;
  }>,
  options?: Options,
) {
  if (!options)
    return {
      absentDays: records.filter((item) => item.dayStatus === 'ABSENT').length,
      halfDays: records.filter((item) => item.dayStatus === 'HALF_DAY').length,
    };
  const recorded = new Map(
    records
      .filter((item) => item.workDate)
      .map((item) => [item.workDate!.toISOString().slice(0, 10), item]),
  );
  const holidays = new Set(
    options.holidays
      .filter((item) => !item.isOptional && (!item.branchId || item.branchId === options.branchId))
      .map((item) => item.holidayDate.toISOString().slice(0, 10)),
  );
  for (const key of options.employeeSelectedDates ?? []) holidays.add(key);
  const result = { absentDays: 0, halfDays: 0 };
  for (
    const date = new Date(options.periodStart);
    date <= options.periodEnd;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = date.toISOString().slice(0, 10),
      record = recorded.get(key);
    if (
      (options.dateOfJoining && date < options.dateOfJoining) ||
      (options.dateOfLeaving && date > options.dateOfLeaving)
    )
      continue;
    const leave = Math.min(
      1,
      options.leaves.reduce((sum, item) => sum + leaveUnitsOn(item, date), 0),
    );
    let missing = record?.dayStatus === 'ABSENT' ? 1 : record?.dayStatus === 'HALF_DAY' ? 0.5 : 0;
    const assignment = options.shifts?.find(
      (item) => item.startsOn <= date && (!item.endsOn || item.endsOn >= date),
    );
    const working =
      (assignment?.shift.daysOfWeek ?? options.workWeekDays).includes(date.getUTCDay() || 7) &&
      !holidays.has(key);
    // Explicit attendance records on a configured weekly off or company holiday must not create
    // a salary deduction. Those dates are outside the payroll's scheduled working-day basis.
    if (options.skipNonworkingDays && !working) continue;
    if (!record) missing = 1;
    if (record?.dayStatus === 'ON_LEAVE' && leave < 1) missing = 1;
    const uncovered = Math.max(0, missing - leave);
    if (uncovered >= 1) result.absentDays++;
    else if (uncovered > 0) result.halfDays += uncovered * 2;
  }
  return result;
}
