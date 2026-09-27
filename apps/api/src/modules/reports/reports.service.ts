import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { lateMarks } from '../attendance/attendance-late';
import { decodeEntry } from '../timesheets/timesheet-shared';
import { unmarkedAbsences } from './report-absences';

const DAY_MS = 86_400_000;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

function span(fromText: string, toText: string) {
  const from = dateOnly(fromText);
  const to = dateOnly(toText);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from)
    throw new ConflictError('Choose a start date on or before the end date.');
  if (to.getTime() - from.getTime() > 366 * DAY_MS)
    throw new ConflictError('Report on a year at most.');
  return { from, to };
}

const count = <T>(items: T[], keyOf: (item: T) => string) => {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(keyOf(item), (totals.get(keyOf(item)) ?? 0) + 1);
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

/**
 * The organization's reports, each read straight from the records the rest of the product keeps,
 * and each held to the same "read everyone's" permission as the screen it summarises.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly database: TenantDatabaseService) {}

  /** Who works here: by department, branch and type, and who joined and left month by month. */
  headcount(context: DomainContext) {
    requirePermission(context, 'employees.read.all');
    return this.database.run(context, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { organizationId: context.organizationId },
        select: {
          id: true,
          status: true,
          employmentType: true,
          dateOfJoining: true,
          dateOfLeaving: true,
          department: { select: { name: true } },
          primaryBranch: { select: { name: true } },
        },
      });
      const current = employees.filter((employee) => employee.status === 'ACTIVE');
      // The department the employee list shows: the department record when there is one, else the
      // department written on the latest employment record. Counting only the first put people
      // the directory lists under Engineering into "No department".
      const records = await tx.employeeEmploymentRecord.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: { in: current.map((employee) => employee.id) },
        },
        orderBy: [{ effectiveFrom: 'asc' }],
        select: { employeeId: true, department: true },
      });
      const recorded = new Map(records.map((record) => [record.employeeId, record.department]));
      const departmentOf = (employee: (typeof current)[number]) =>
        employee.department?.name ?? (recorded.get(employee.id)?.trim() || 'No department');
      const months: Array<{ month: string; joined: number; left: number }> = [];
      const now = new Date();
      for (let back = 11; back >= 0; back -= 1) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        const within = (date: Date | null) => Boolean(date && date >= start && date <= end);
        months.push({
          month: key(start).slice(0, 7),
          joined: employees.filter((employee) => within(employee.dateOfJoining)).length,
          left: employees.filter((employee) => within(employee.dateOfLeaving)).length,
        });
      }
      const leftThisYear = months.reduce((sum, month) => sum + month.left, 0);
      return {
        current: current.length,
        byDepartment: count(current, departmentOf),
        byBranch: count(current, (employee) => employee.primaryBranch?.name ?? 'No branch'),
        byType: count(current, (employee) => employee.employmentType),
        months,
        // Leavers over the year against the average of those employed now and those who left.
        attritionPercent: current.length
          ? Math.round((leftThisYear / ((current.length * 2 + leftThisYear) / 2)) * 1000) / 10
          : 0,
      };
    });
  }

  /** Per person: days present, absent, half, late, and hours worked. */
  attendance(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'attendance.read.all');
    const { from, to } = span(fromText, toText);
    return this.database.run(context, async (tx) => {
      const [records, late, employees, unmarked] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: { organizationId: context.organizationId, workDate: { gte: from, lte: to } },
          select: { employeeId: true, dayStatus: true, workedMinutes: true, overtimeMinutes: true },
        }),
        lateMarks(tx, context.organizationId, { from, to }),
        tx.employee.findMany({
          where: { organizationId: context.organizationId, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { firstName: 'asc' },
        }),
        unmarkedAbsences(tx, context.organizationId, from, to),
      ]);
      const lateCount = new Map<string, number>();
      for (const mark of late)
        lateCount.set(mark.employeeId, (lateCount.get(mark.employeeId) ?? 0) + 1);
      return {
        from: key(from),
        to: key(to),
        rows: employees.map((employee) => {
          const mine = records.filter((record) => record.employeeId === employee.id);
          return {
            employeeNumber: employee.employeeNumber,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            present: mine.filter((record) => ['PRESENT', 'LATE'].includes(record.dayStatus)).length,
            halfDays: mine.filter((record) => record.dayStatus === 'HALF_DAY').length,
            // Marked absent, plus working days with nothing recorded when those count as absent.
            absent:
              mine.filter((record) => record.dayStatus === 'ABSENT').length +
              (unmarked.get(employee.id) ?? 0),
            late: lateCount.get(employee.id) ?? 0,
            workedHours:
              Math.round((mine.reduce((sum, record) => sum + record.workedMinutes, 0) / 60) * 10) /
              10,
            overtimeHours:
              Math.round(
                (mine.reduce((sum, record) => sum + record.overtimeMinutes, 0) / 60) * 10,
              ) / 10,
          };
        }),
      };
    });
  }

  /** Leave taken in the span, by type and by person. Approved leave only. */
  leave(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'leave.requests.read.all');
    const { from, to } = span(fromText, toText);
    return this.database.run(context, async (tx) => {
      const requests = await tx.leaveRequest.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'APPROVED',
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          requestedDays: true,
          leaveType: { select: { name: true, paid: true } },
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
      });
      const byType = new Map<string, { label: string; paid: boolean; days: number }>();
      const byPerson = new Map<string, { employeeNumber: string; name: string; days: number }>();
      for (const request of requests) {
        const days = Number(request.requestedDays);
        const type = byType.get(request.leaveType.name) ?? {
          label: request.leaveType.name,
          paid: request.leaveType.paid,
          days: 0,
        };
        type.days += days;
        byType.set(type.label, type);
        const who = request.employee.employeeNumber;
        const person = byPerson.get(who) ?? {
          employeeNumber: who,
          name: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
          days: 0,
        };
        person.days += days;
        byPerson.set(who, person);
      }
      return {
        from: key(from),
        to: key(to),
        totalDays: requests.reduce((sum, request) => sum + Number(request.requestedDays), 0),
        byType: [...byType.values()].sort((a, b) => b.days - a.days),
        byPerson: [...byPerson.values()].sort((a, b) => b.days - a.days),
      };
    });
  }

  /** Hours logged per project in the span, split into billable and non-billable. */
  projectHours(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'timesheets.read.all');
    const { from, to } = span(fromText, toText);
    return this.database.run(context, async (tx) => {
      const entries = await tx.timesheetEntry.findMany({
        where: {
          organizationId: context.organizationId,
          workDate: { gte: from, lte: to },
          source: 'MANUAL',
        },
        select: { minutes: true, description: true },
      });
      const projects = new Map<
        string,
        { project: string; billableHours: number; nonBillableHours: number }
      >();
      for (const entry of entries) {
        const decoded = decodeEntry(entry);
        const name = decoded.projectName ?? 'No project';
        const row = projects.get(name) ?? { project: name, billableHours: 0, nonBillableHours: 0 };
        const hours = entry.minutes / 60;
        if (decoded.billable === false) row.nonBillableHours += hours;
        else row.billableHours += hours;
        projects.set(name, row);
      }
      const rows = [...projects.values()]
        .map((row) => ({
          ...row,
          billableHours: Math.round(row.billableHours * 10) / 10,
          nonBillableHours: Math.round(row.nonBillableHours * 10) / 10,
        }))
        .sort(
          (a, b) => b.billableHours + b.nonBillableHours - (a.billableHours + a.nonBillableHours),
        );
      const billable = rows.reduce((sum, row) => sum + row.billableHours, 0);
      const total = billable + rows.reduce((sum, row) => sum + row.nonBillableHours, 0);
      return {
        from: key(from),
        to: key(to),
        rows,
        totalHours: Math.round(total * 10) / 10,
        billablePercent: total ? Math.round((billable / total) * 1000) / 10 : 0,
      };
    });
  }
}
