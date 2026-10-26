import { Prisma } from '../../generated/prisma/client';

/**
 * How much of a period's overtime was worked on a weekly off or a public holiday.
 *
 * Attendance is what knows: each record was classified when it was punched or corrected
 * (`overtime_day_type`), against the employee's shift, the work week and the holiday calendar.
 * Timesheets carry totals only, so the split has to come from here.
 */
export type OvertimeDayMinutes = { weeklyOffMinutes: number; holidayMinutes: number };

export const NO_OVERTIME_DAYS: OvertimeDayMinutes = { weeklyOffMinutes: 0, holidayMinutes: 0 };

export function sumOvertimeByDayType(
  records: Array<{ overtimeMinutes: number | null; overtimeDayType: string | null }>,
): OvertimeDayMinutes {
  const total = { ...NO_OVERTIME_DAYS };
  for (const record of records) {
    const minutes = record.overtimeMinutes ?? 0;
    if (minutes <= 0) continue;
    if (record.overtimeDayType === 'HOLIDAY') total.holidayMinutes += minutes;
    else if (record.overtimeDayType === 'WEEKLY_OFF') total.weeklyOffMinutes += minutes;
  }
  return total;
}

/**
 * Splits the overtime an approved timesheet pays for across its rates.
 *
 * The approved timesheet stays the authority on *how many* overtime minutes are paid — a run
 * consumes only approved timesheets, and attendance is not an approval. Attendance decides only
 * which of those minutes were worked on a rarer, better-paid day, so the paid total is allotted
 * to the holiday rate first, then the weekly-off rate, and whatever is left is ordinary overtime
 * at the employee's own multiplier. A rate left unset pays the employee's multiplier, which is
 * exactly what was paid before any of this existed.
 */
export function overtimePay(input: {
  minutePay: Prisma.Decimal;
  overtimeMinutes: number;
  employeeMultiplier: Prisma.Decimal;
  days: OvertimeDayMinutes;
  rates: { weeklyOff: number | null; holiday: number | null };
}) {
  let remaining = Math.max(0, input.overtimeMinutes);
  let amount = new Prisma.Decimal(0);
  for (const [minutes, rate] of [
    [input.days.holidayMinutes, input.rates.holiday],
    [input.days.weeklyOffMinutes, input.rates.weeklyOff],
  ] as const) {
    if (rate === null || remaining <= 0) continue;
    const paid = Math.min(remaining, Math.max(0, minutes));
    if (paid <= 0) continue;
    remaining -= paid;
    amount = amount.add(input.minutePay.mul(paid).mul(rate));
  }
  return amount.add(input.minutePay.mul(remaining).mul(input.employeeMultiplier));
}
