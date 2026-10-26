import type { Prisma } from '../../generated/prisma/client';
import { instantAtLocalTime, wallClock } from './attendance-auto-checkout';

export type LateMark = { employeeId: string; date: string; minutesLate: number };

/**
 * Days someone checked in after their shift started, beyond the organization's grace.
 *
 * Worked out from what is recorded rather than stored: the first check-in of the day against the
 * start of the shift they were assigned for that weekday, in the organization's timezone. A day
 * with no assigned shift sets no expectation, so it is never late.
 */
export async function lateMarks(
  tx: Prisma.TransactionClient,
  organizationId: string,
  options: { from: Date; to: Date; employeeIds?: readonly string[] },
): Promise<LateMark[]> {
  const [organization, settings] = await Promise.all([
    tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    }),
    tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { lateGraceMinutes: true },
    }),
  ]);
  const grace = settings?.lateGraceMinutes ?? 0;
  const scope = options.employeeIds ? { employeeId: { in: [...options.employeeIds] } } : {};
  const [records, assignments] = await Promise.all([
    tx.attendanceRecord.findMany({
      where: { organizationId, workDate: { gte: options.from, lte: options.to }, ...scope },
      select: {
        employeeId: true,
        workDate: true,
        punches: {
          where: { punchType: 'IN' },
          orderBy: { occurredAt: 'asc' },
          take: 1,
          select: { occurredAt: true },
        },
      },
    }),
    tx.employeeShiftAssignment.findMany({
      where: {
        organizationId,
        startsOn: { lte: options.to },
        OR: [{ endsOn: null }, { endsOn: { gte: options.from } }],
        ...scope,
      },
      select: {
        employeeId: true,
        startsOn: true,
        endsOn: true,
        shift: { select: { startsAt: true, daysOfWeek: true } },
      },
    }),
  ]);

  const marks: LateMark[] = [];
  for (const record of records) {
    const firstIn = record.punches[0]?.occurredAt;
    if (!firstIn) continue;
    const weekday = record.workDate.getUTCDay() || 7;
    const assignment = assignments.find(
      (row) =>
        row.employeeId === record.employeeId &&
        row.startsOn <= record.workDate &&
        (!row.endsOn || row.endsOn >= record.workDate) &&
        row.shift.daysOfWeek.includes(weekday),
    );
    if (!assignment) continue;
    const date = record.workDate.toISOString().slice(0, 10);
    const start = instantAtLocalTime(
      date,
      wallClock(assignment.shift.startsAt),
      organization.timezone,
    );
    const minutesLate = Math.floor((firstIn.getTime() - start.getTime()) / 60_000);
    if (minutesLate > grace) marks.push({ employeeId: record.employeeId, date, minutesLate });
  }
  return marks;
}

/** Half-days of pay a month's late marks cost: every `perHalfDay` of them, half a day. */
export function lateHalfDays(count: number, perHalfDay: number) {
  return perHalfDay > 0 ? Math.floor(count / perHalfDay) : 0;
}
