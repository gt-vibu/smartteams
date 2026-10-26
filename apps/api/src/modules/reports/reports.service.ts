import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { attendanceLeaveUnits } from '../attendance/attendance-leave-units';
import { reportLeaveDays } from './report-leave-days';
import { lateMarks } from '../attendance/attendance-late';
import { WorkingDayService } from '../shifts/working-day.service';
import { decodeEntry } from '../timesheets/timesheet-shared';
import { unmarkedAbsences } from './report-absences';
import type { Response } from 'express';
import { employeeNameSearch } from '../employees/employee-name-search';

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

async function writeCsv(response: Response, line: string) {
  if (!response.write(line)) await new Promise<void>((resolve) => response.once('drain', resolve));
}

/**
 * The organization's reports, each read straight from the records the rest of the product keeps,
 * and each held to the same "read everyone's" permission as the screen it summarises.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly database: TenantDatabaseService) {}

  /** Streams matching leave rows in bounded pages; the API never builds a 50,000-row array. */
  async exportLeaveCsv(context: DomainContext, filters: { from: string; to: string; employeeId?: string; departmentId?: string; search?: string; status?: string }, response: Response) {
    requirePermission(context, 'leave.requests.read.all');
    const { from, to } = span(filters.from, filters.to);
    response.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="leave-${key(from)}-to-${key(to)}.csv"`);
    response.setHeader('Cache-Control', 'no-store');
    await writeCsv(response, '\uFEFFEmployee ID,Employee,Department,Leave type,Start date,End date,Days,Status,Reason\r\n');
    let cursor: string | undefined;
    const search = employeeNameSearch(filters.search);
    try {
      do {
        const page = await this.database.run(context, (tx) => tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId: filters.employeeId,
            status: filters.status as never,
            startDate: { lte: to }, endDate: { gte: from },
            ...(context.branchId ? { branchId: context.branchId } : {}),
            ...((filters.departmentId || search) ? { employee: { ...(search ?? {}), ...(filters.departmentId ? { departmentId: filters.departmentId } : {}) } } : {}),
          },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: 'asc' }, take: 500,
          select: {
            id: true, startDate: true, endDate: true, requestedDays: true, status: true, reason: true,
            employee: { select: { employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } } },
            leaveType: { select: { name: true } },
          },
        }));
        for (const row of page) await writeCsv(response, [
          row.employee.employeeNumber,
          `${row.employee.firstName} ${row.employee.lastName}`.trim(),
          row.employee.department?.name ?? '', row.leaveType.name, key(row.startDate), key(row.endDate),
          row.requestedDays, row.status, row.reason ?? '',
        ].map(csvCell).join(',') + '\r\n');
        cursor = page.length === 500 ? page.at(-1)?.id : undefined;
        if (page.length < 500) break;
      } while (cursor);
      response.end();
    } catch (error) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }

  /** Streams matching timesheet rows in bounded pages for large organization exports. */
  async exportTimesheetsCsv(context: DomainContext, filters: { from: string; to: string; employeeId?: string; departmentId?: string; search?: string; status?: string }, response: Response) {
    requirePermission(context, 'timesheets.read.all');
    const { from, to } = span(filters.from, filters.to);
    response.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="timesheets-${key(from)}-to-${key(to)}.csv"`);
    response.setHeader('Cache-Control', 'no-store');
    await writeCsv(response, '\uFEFFEmployee ID,Employee,Department,Period start,Period end,Total hours,Regular hours,Overtime hours,Status\r\n');
    let cursor: string | undefined;
    const search = employeeNameSearch(filters.search);
    try {
      do {
        const page = await this.database.run(context, (tx) => tx.timesheet.findMany({
          where: {
            organizationId: context.organizationId, employeeId: filters.employeeId, status: filters.status as never,
            period: { periodStart: { lte: to }, periodEnd: { gte: from } },
            ...(context.branchId ? { branchId: context.branchId } : {}),
            ...((filters.departmentId || search) ? { employee: { ...(search ?? {}), ...(filters.departmentId ? { departmentId: filters.departmentId } : {}) } } : {}),
          },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: 'asc' }, take: 500,
          select: {
            id: true, status: true, totalMinutes: true, regularMinutes: true, overtimeMinutes: true,
            employee: { select: { employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } } },
            period: { select: { periodStart: true, periodEnd: true } },
          },
        }));
        for (const row of page) await writeCsv(response, [
          row.employee.employeeNumber, `${row.employee.firstName} ${row.employee.lastName}`.trim(),
          row.employee.department?.name ?? '', key(row.period.periodStart), key(row.period.periodEnd),
          (row.totalMinutes / 60).toFixed(2), (row.regularMinutes / 60).toFixed(2),
          (row.overtimeMinutes / 60).toFixed(2), row.status,
        ].map(csvCell).join(',') + '\r\n');
        cursor = page.length === 500 ? page.at(-1)?.id : undefined;
        if (page.length < 500) break;
      } while (cursor);
      response.end();
    } catch (error) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }

  /** Who works here: by department, branch and type, and who joined and left month by month. */
  headcount(context: DomainContext) {
    requirePermission(context, 'employees.read.all');
    return this.database.run(context, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { organizationId: context.organizationId },
        select: {
          id: true,
          status: true,
          managerEmployeeId: true,
          employmentType: true,
          dateOfJoining: true,
          dateOfLeaving: true,
          department: { select: { name: true } },
          primaryBranch: { select: { name: true } },
        },
      });
      const current = employees.filter((employee) => employee.status === 'ACTIVE');
      const reportingEmployeeIds = new Set(current.map((employee) => employee.managerEmployeeId).filter((id): id is string => Boolean(id)));
      const managers = current.filter((employee) => reportingEmployeeIds.has(employee.id)).length;
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
      const months: Array<{ month: string; joined: number; left: number; active: number }> = [];
      const now = new Date();
      for (let back = 11; back >= 0; back -= 1) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        const within = (date: Date | null) => Boolean(date && date >= start && date <= end);
        months.push({
          month: key(start).slice(0, 7),
          joined: employees.filter((employee) => within(employee.dateOfJoining)).length,
          left: employees.filter((employee) => within(employee.dateOfLeaving)).length,
          active: employees.filter((employee) => Boolean(employee.dateOfJoining && employee.dateOfJoining <= end && (!employee.dateOfLeaving || employee.dateOfLeaving > end))).length,
        });
      }
      const leftThisYear = months.reduce((sum, month) => sum + month.left, 0);
      return {
        current: current.length,
        former: employees.filter((employee) => employee.status !== 'ACTIVE').length,
        managers,
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
          select: {
            employeeId: true,
            workDate: true,
            dayStatus: true,
            workedMinutes: true,
            overtimeMinutes: true,
          },
        }),
        lateMarks(tx, context.organizationId, { from, to }),
        tx.employee.findMany({
          where: { organizationId: context.organizationId, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { firstName: 'asc' },
        }),
        unmarkedAbsences(tx, context.organizationId, from, to),
      ]);
      const leaveUnits = await attendanceLeaveUnits(tx, context.organizationId, records);
      const units = (record: (typeof records)[number]) =>
        leaveUnits.get(`${record.employeeId}:${key(record.workDate)}`) ?? 0;
      const byEmployee = new Map<string, typeof records>();
      for (const record of records) {
        const group = byEmployee.get(record.employeeId) ?? [];
        group.push(record);
        byEmployee.set(record.employeeId, group);
      }
      const lateCount = new Map<string, number>();
      for (const mark of late)
        lateCount.set(mark.employeeId, (lateCount.get(mark.employeeId) ?? 0) + 1);
      return {
        from: key(from),
        to: key(to),
        rows: employees.map((employee) => {
          const mine = byEmployee.get(employee.id) ?? [];
          return {
            employeeNumber: employee.employeeNumber,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            present: mine.reduce(
              (sum, record) =>
                sum + (['PRESENT', 'LATE'].includes(record.dayStatus) ? 1 - units(record) : 0),
              0,
            ),
            halfDays: mine.filter((record) => record.dayStatus === 'HALF_DAY').length,
            // Marked absent, plus working days with nothing recorded when those count as absent.
            absent:
              mine.reduce(
                (sum, record) => sum + (record.dayStatus === 'ABSENT' ? 1 - units(record) : 0),
                0,
              ) + (unmarked.get(employee.id) ?? 0),
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

  /** Small overview projection: calculate the daily chart on the server instead of sending 50k rows to the browser. */
  async attendanceSummary(context: DomainContext, date: string) {
    const report = await this.attendance(context, date, date);
    return report.rows.reduce((summary, row) => ({
      from: summary.from,
      to: summary.to,
      totalEmployees: summary.totalEmployees + 1,
      present: summary.present + row.present,
      halfDays: summary.halfDays + row.halfDays,
      absent: summary.absent + row.absent,
      late: summary.late + row.late,
    }), { from: report.from, to: report.to, totalEmployees: 0, present: 0, halfDays: 0, absent: 0, late: 0 });
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
          startDate: true,
          endDate: true,
          chargedDates: true,
          session: true,
          leaveType: { select: { name: true, paid: true } },
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
      });
      const byType = new Map<string, { label: string; paid: boolean; days: number }>();
      const byPerson = new Map<string, { employeeNumber: string; name: string; days: number }>();
      for (const request of requests) {
        const days = reportLeaveDays(request, from, to);
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
        totalDays: requests.reduce((sum, request) => sum + reportLeaveDays(request, from, to), 0),
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

  /** Approved attendance corrections and timesheet entries that occurred on non-working days. */
  async nonWorkingDaysAudit(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'attendance.read.all');
    const { from, to } = span(fromText, toText);
    return this.database.run(context, async (tx) => {
      const approvedCorrections = await tx.attendanceCorrection.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'APPROVED',
          attendanceRecord: {
            workDate: { gte: from, lte: to },
          },
        },
        include: {
          attendanceRecord: {
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, employeeNumber: true },
              },
            },
          },
          approvals: {
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const approvedTimesheetEntries = await tx.timesheetEntry.findMany({
        where: {
          organizationId: context.organizationId,
          workDate: { gte: from, lte: to },
          timesheet: {
            status: 'APPROVED',
          },
        },
        include: {
          timesheet: {
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, employeeNumber: true },
              },
              approvals: {
                where: { status: 'APPROVED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      const workingDayService = new WorkingDayService(this.database);
      const items = [];

      for (const corr of approvedCorrections) {
        const record = corr.attendanceRecord;
        const dayEval = await workingDayService.evaluateDay(
          tx,
          context.organizationId,
          record.employeeId,
          record.workDate,
        );
        if (!dayEval.isWorkingDay) {
          items.push({
            type: 'ATTENDANCE_CORRECTION',
            id: corr.id,
            workDate: key(record.workDate),
            employee: record.employee,
            reason: corr.reason,
            nonWorkingDayReason: dayEval.reason,
            nonWorkingDayDetail: dayEval.detail,
            workedMinutes: record.workedMinutes,
            approvedByUserId: corr.approvals[0]?.approverUserId ?? null,
            approvedAt: corr.approvals[0]?.createdAt.toISOString() ?? null,
          });
        }
      }

      for (const entry of approvedTimesheetEntries) {
        const ts = entry.timesheet;
        const dayEval = await workingDayService.evaluateDay(
          tx,
          context.organizationId,
          ts.employeeId,
          entry.workDate,
        );
        if (!dayEval.isWorkingDay) {
          const decoded = decodeEntry(entry);
          items.push({
            type: 'TIMESHEET_ENTRY',
            id: entry.id,
            workDate: key(entry.workDate),
            employee: ts.employee,
            projectName: decoded.projectName ?? null,
            description: decoded.description ?? null,
            nonWorkingDayReason: dayEval.reason,
            nonWorkingDayDetail: dayEval.detail,
            workedMinutes: entry.minutes,
            approvedByUserId: ts.approvals[0]?.approverUserId ?? null,
            approvedAt: ts.approvals[0]?.createdAt.toISOString() ?? null,
          });
        }
      }

      return {
        from: key(from),
        to: key(to),
        totalItems: items.length,
        items,
      };
    });
  }
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : value instanceof Date
          ? value.toISOString()
          : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}
