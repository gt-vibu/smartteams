import { employeeDisplayName, type Employee, type Timesheet } from '@smarteam/contracts';

/**
 * One row of the timesheet audit table, assembled from what the API actually returns.
 *
 * This screen previously rendered a hardcoded array of invented employees — real-looking names,
 * employee numbers, billable splits and project allocations — held in `useState` so that
 * approving one appeared to work while changing nothing. Every figure below now comes from a
 * response.
 *
 * Two of the old columns are gone rather than reproduced, because nothing serves them:
 *
 *   - *Billable hours* has no backend concept. The API reports regular and overtime minutes, so
 *     the table shows overtime, which is a real number that payroll actually prices.
 *   - *Project allocation* would need per-entry project attribution. Timesheet entries carry a
 *     date, minutes and a description; there is no project on them to group by.
 *
 * Inventing either in the frontend would put a number in front of an approver that no system can
 * reproduce, which is worse than the column being absent.
 */
export type TimesheetAuditRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  period: string;
  totalHours: number;
  overtimeHours: number;
  status: string;
  entryCount: number;
};

const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** Formats a period as its date range, or falls back to the id when the period was not expanded. */
function periodLabel(timesheet: Timesheet): string {
  if (!timesheet.period) return '--';
  const { periodStart, periodEnd, periodType } = timesheet.period;
  return `${periodType} · ${periodStart.slice(0, 10)} – ${periodEnd.slice(0, 10)}`;
}

export function toAuditRows(timesheets: Timesheet[], employees: Employee[]): TimesheetAuditRow[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return timesheets.map((timesheet) => {
    const employee = byId.get(timesheet.employeeId);
    return {
      id: timesheet.id,
      employeeId: timesheet.employeeId,
      // An employee the caller cannot read is named as unavailable rather than blank, so the row
      // does not look like a data error.
      employeeName: employee ? employeeDisplayName(employee) : 'Not visible to you',
      employeeNumber: employee?.employeeNumber ?? '--',
      period: periodLabel(timesheet),
      totalHours: minutesToHours(timesheet.totalMinutes),
      overtimeHours: minutesToHours(timesheet.overtimeMinutes),
      status: timesheet.status,
      entryCount: timesheet.entries?.length ?? 0,
    };
  });
}
