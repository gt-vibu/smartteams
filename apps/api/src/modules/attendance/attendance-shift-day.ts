import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';

/** What kind of day overtime was worked on; payroll pays each at its own rate. */
export type OvertimeDayType = 'WORKING_DAY' | 'WEEKLY_OFF' | 'HOLIDAY';

/**
 * How many minutes an employee is expected to be at work on a day, which is what overtime is
 * measured against, and what kind of day it is.
 *
 * - A holiday that applies to them (a required one for the company or their branch, or an
 *   optional one they chose): nothing is expected, so all time worked is holiday overtime.
 * - A day their shift does not run (a weekly off): likewise, weekly-off overtime.
 * - A day their shift runs: the shift's full span, start to end. Punches do not record breaks, so
 *   time on site includes the break and is compared with a span that includes it too.
 * - No shift that day: the organization's working week and standard day.
 */
export async function expectedDayOn(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
  branchId: string | null | undefined,
  workDate: Date,
  standardDayMinutes: number,
): Promise<{ minutes: number; dayType: OvertimeDayType }> {
  const [holiday, chosen, assignment] = await Promise.all([
    tx.holiday.findFirst({
      where: {
        organizationId,
        isActive: true,
        isOptional: false,
        holidayDate: workDate,
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      select: { id: true },
    }),
    tx.employeeHolidaySelection.findFirst({
      where: {
        organizationId,
        employeeId,
        status: 'CONFIRMED',
        holiday: { isActive: true, holidayDate: workDate },
      },
      select: { id: true },
    }),
    tx.employeeShiftAssignment.findFirst({
      where: {
        organizationId,
        employeeId,
        startsOn: { lte: workDate },
        OR: [{ endsOn: null }, { endsOn: { gte: workDate } }],
        },
      orderBy: { startsOn: 'desc' },
      select: {
        shift: {
          select: { daysOfWeek: true, startsAt: true, endsAt: true, crossesMidnight: true },
        },
      },
    }),
  ]);
  if (holiday || chosen) return { minutes: 0, dayType: 'HOLIDAY' };
  if (!assignment) {
    const settings = await tx.organizationSettings.findUniqueOrThrow({
      where: { organizationId }, select: { workWeekDays: true },
    });
    const working = settings.workWeekDays.includes(workDate.getUTCDay() || 7);
    return working
      ? { minutes: standardDayMinutes, dayType: 'WORKING_DAY' }
      : { minutes: 0, dayType: 'WEEKLY_OFF' };
  }
  const minutes = shiftMinutesOn(assignment.shift, workDate);
  return { minutes, dayType: minutes === 0 ? 'WEEKLY_OFF' : 'WORKING_DAY' };
}

/** The shift's span in minutes on a date, break included: 0 on a day it does not run. */
export function shiftMinutesOn(
  shift: { daysOfWeek: number[]; startsAt: Date; endsAt: Date; crossesMidnight: boolean },
  workDate: Date,
): number {
  // ISO weekday, Monday 1 to Sunday 7, of the calendar date.
  const weekday = ((workDate.getUTCDay() + 6) % 7) + 1;
  if (!shift.daysOfWeek.includes(weekday)) return 0;
  const minutesOf = (time: Date) => time.getUTCHours() * 60 + time.getUTCMinutes();
  let span = minutesOf(shift.endsAt) - minutesOf(shift.startsAt);
  if (shift.crossesMidnight || span <= 0) span += 24 * 60;
  return span;
}
