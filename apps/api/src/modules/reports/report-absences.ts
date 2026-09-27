import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { unmarkedDaysAreAbsent } from '../attendance/attendance-work-week.service';
import { organizationToday } from '../employees/employee-branch-rules';

const DAY_MS = 86_400_000;
const key = (date: Date) => date.toISOString().slice(0, 10);
/** ISO weekday, 1 (Monday) to 7 (Sunday), of a UTC calendar date. */
const isoWeekday = (date: Date) => date.getUTCDay() || 7;

/**
 * Working days nobody accounted for, per employee: no attendance, no approved leave, not a
 * holiday or weekly off — the days payroll charges as loss of pay when the company counts
 * unmarked days as absences.
 *
 * The attendance report counted only days explicitly marked absent, so someone who never checked
 * in all month showed no absences at all while payroll docked them for every one. Only finished
 * days count: today can still be marked.
 */
export async function unmarkedAbsences(
  tx: TenantTransaction,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const absences = new Map<string, number>();
  const settings = await tx.organizationSettings.findUnique({
    where: { organizationId },
    select: { workWeekDays: true, metadata: true },
  });
  if (!settings || !unmarkedDaysAreAbsent(settings.metadata)) return absences;

  const yesterday = new Date((await organizationToday(tx, organizationId)).getTime() - DAY_MS);
  const end = to < yesterday ? to : yesterday;
  if (end < from) return absences;

  const [employees, holidays, records, leaves] = await Promise.all([
    tx.employee.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { id: true, dateOfJoining: true, primaryBranchId: true },
    }),
    tx.holiday.findMany({
      where: {
        organizationId,
        isActive: true,
        isOptional: false,
        holidayDate: { gte: from, lte: end },
      },
      select: { holidayDate: true, branchId: true },
    }),
    tx.attendanceRecord.findMany({
      where: { organizationId, workDate: { gte: from, lte: end } },
      select: { employeeId: true, workDate: true },
    }),
    tx.leaveRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: from },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  const marked = new Set(records.map((record) => `${record.employeeId}:${key(record.workDate)}`));
  for (const employee of employees) {
    const joined = employee.dateOfJoining;
    const start = joined && joined > from ? joined : from;
    const holidayDays = new Set(
      holidays
        .filter((holiday) => !holiday.branchId || holiday.branchId === employee.primaryBranchId)
        .map((holiday) => key(holiday.holidayDate)),
    );
    const onLeave = leaves.filter((leave) => leave.employeeId === employee.id);
    let count = 0;
    for (let day = new Date(start); day <= end; day = new Date(day.getTime() + DAY_MS)) {
      if (!settings.workWeekDays.includes(isoWeekday(day))) continue;
      const dayKey = key(day);
      if (holidayDays.has(dayKey) || marked.has(`${employee.id}:${dayKey}`)) continue;
      if (onLeave.some((leave) => leave.startDate <= day && leave.endDate >= day)) continue;
      count += 1;
    }
    if (count) absences.set(employee.id, count);
  }
  return absences;
}
