import { shiftMinutesOn } from '../attendance/attendance-shift-day';
import type { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';
import { leaveUnitsOn } from '../leave/leave-units';

type Run = { id: string; periodStart: Date; periodEnd: Date; calculationStaleAt?: Date | null };
export async function payrollReadiness(
  tx: Prisma.TransactionClient,
  organizationId: string,
  run: Run,
) {
  const [
    pendingLeave,
    pendingCorrections,
    cancellations,
    leaves,
    attendance,
    timesheets,
    employees,
    settings,
    shifts,
  ] = await Promise.all([
    tx.leaveRequest.count({
      where: {
        organizationId,
        status: 'PENDING',
        startDate: { lte: run.periodEnd },
        endDate: { gte: run.periodStart },
      },
    }),
    tx.attendanceCorrection.count({
      where: {
        organizationId,
        status: 'PENDING',
        attendanceRecord: { workDate: { gte: run.periodStart, lte: run.periodEnd } },
      },
    }),
    tx.leaveRequest.count({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: run.periodEnd },
        endDate: { gte: run.periodStart },
        cancellation: { path: ['status'], equals: 'PENDING' },
      },
    }),
    tx.leaveRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: run.periodEnd },
        endDate: { gte: run.periodStart },
      },
      select: {
        id: true,
        employeeId: true,
        session: true,
        chargedDates: true,
        startDate: true,
        endDate: true,
      },
    }),
    tx.attendanceRecord.findMany({
      where: {
        organizationId,
        workDate: { gte: run.periodStart, lte: run.periodEnd },
        workedMinutes: { gt: 0 },
      },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        workedMinutes: true,
        scheduledMinutes: true,
      },
    }),
    tx.timesheetEntry.findMany({
      where: {
        organizationId,
        workDate: { gte: run.periodStart, lte: run.periodEnd },
        timesheet: { status: { in: ['SUBMITTED', 'APPROVED'] } },
      },
      select: { timesheet: { select: { employeeId: true } }, workDate: true, minutes: true },
    }),
    tx.employee.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: run.periodEnd } }],
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        compensations: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          select: { id: true },
        },
        payComponents: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
            payComponent: { isActive: true },
          },
          select: { id: true },
        },
        payrollPolicies: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          select: { id: true },
        },
      },
    }),
    tx.organizationSettings.findUnique({ where: { organizationId } }),
    tx.employeeShiftAssignment.findMany({
      where: {
        organizationId,
        startsOn: { lte: run.periodEnd },
        OR: [{ endsOn: null }, { endsOn: { gte: run.periodStart } }],
        shift: { isActive: true },
      },
      orderBy: { startsOn: 'desc' },
      include: { shift: true },
    }),
  ]);
  const blockers: Array<{ code: string; count: number; message: string; module: string }> = [];
  const add = (code: string, count: number, message: string, module: string) => {
    if (count) blockers.push({ code, count, message, module });
  };
  add(
    'STALE_CALCULATION',
    run.calculationStaleAt ? 1 : 0,
    'Inputs changed. Recalculate this run.',
    'payroll',
  );
  add('PENDING_LEAVE', pendingLeave, 'Decide pending leave within this period.', 'approvals');
  add(
    'PENDING_CORRECTIONS',
    pendingCorrections,
    'Decide pending attendance corrections within this period.',
    'approvals',
  );
  add(
    'PENDING_CANCELLATIONS',
    cancellations,
    'Review leave cancellations before closing this period.',
    'approvals',
  );
  const grouped = new Map<string, typeof leaves>();
  for (const leave of leaves)
    grouped.set(leave.employeeId, [...(grouped.get(leave.employeeId) ?? []), leave]);
  const units = (employeeId: string, date: Date) =>
    Math.min(
      1,
      (grouped.get(employeeId) ?? []).reduce((sum, leave) => sum + leaveUnitsOn(leave, date), 0),
    );
  const expected = (employeeId: string, date: Date) => {
    const assignment = shifts.find(
      (item) =>
        item.employeeId === employeeId &&
        item.startsOn <= date &&
        (!item.endsOn || item.endsOn >= date),
    );
    return assignment
      ? shiftMinutesOn(assignment.shift, date)
      : (settings?.standardDayMinutes ?? 480);
  };
  const conflicts = attendance.filter(
    (record) =>
      record.workedMinutes >
        expected(record.employeeId, record.workDate) *
          (1 - units(record.employeeId, record.workDate)) &&
      units(record.employeeId, record.workDate) > 0,
  );
  add(
    'WORK_DURING_LEAVE',
    conflicts.length,
    'Worked attendance overlaps approved leave. Correct attendance or cancel the leave.',
    'attendance',
  );
  const logged = new Map<string, { employeeId: string; date: Date; minutes: number }>();
  for (const entry of timesheets) {
    const key = `${entry.timesheet.employeeId}:${entry.workDate.toISOString()}`;
    const item = logged.get(key);
    logged.set(key, {
      employeeId: entry.timesheet.employeeId,
      date: entry.workDate,
      minutes: (item?.minutes ?? 0) + entry.minutes,
    });
  }
  const timeConflicts = [...logged.values()].filter(
    (item) =>
      units(item.employeeId, item.date) > 0 &&
      item.minutes > expected(item.employeeId, item.date) * (1 - units(item.employeeId, item.date)),
  );
  add(
    'TIMESHEET_DURING_LEAVE',
    timeConflicts.length,
    'Submitted time exceeds the working portion of an approved leave date. Review the timesheet.',
    'timesheets',
  );
  const missingPay = employees.filter(
    (item) =>
      !item.compensations.length && !item.payComponents.length && !item.payrollPolicies.length,
  );
  add(
    'MISSING_PAY_SETUP',
    missingPay.length,
    'Assign an effective salary, salary policy or pay components to every included employee.',
    'onboarding',
  );
  return {
    ready: blockers.length === 0,
    blockers,
    conflicts: conflicts.slice(0, 100).map((item) => ({
      employeeId: item.employeeId,
      attendanceRecordId: item.id,
      name: (() => {
        const employee = employees.find((employee) => employee.id === item.employeeId);
        return employee
          ? `${employee.firstName} ${employee.lastName} · ${employee.employeeNumber}`
          : 'Employee';
      })(),
      workDate: item.workDate,
    })),
    missingPay: missingPay.slice(0, 100).map((item) => ({
      id: item.id,
      name: `${item.firstName} ${item.lastName}`,
      employeeNumber: item.employeeNumber,
    })),
  };
}

export async function assertPayrollReady(
  tx: Prisma.TransactionClient,
  organizationId: string,
  run: Run,
) {
  const result = await payrollReadiness(tx, organizationId, run);
  if (!result.ready)
    throw new ConflictError(
      `Payroll needs attention: ${result.blockers.map((item) => `${item.message} (${item.count})`).join(' ')}`,
    );
}
