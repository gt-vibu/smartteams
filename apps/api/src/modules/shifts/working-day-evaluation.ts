import { leaveUnitsOn } from '../leave/leave-units';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { shiftMinutesOn } from '../attendance/attendance-shift-day';
import type { WorkingDayEvaluation } from './working-day.service';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export async function evaluateEmployeeWorkingDay(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
  dateInput: Date | string,
): Promise<WorkingDayEvaluation> {
  const workDate =
    typeof dateInput === 'string'
      ? new Date(`${dateInput.slice(0, 10)}T00:00:00.000Z`)
      : new Date(`${dateInput.toISOString().slice(0, 10)}T00:00:00.000Z`);

  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: {
      id: true,
      primaryBranchId: true,
      dateOfJoining: true,
      dateOfLeaving: true,
      status: true,
    },
  });

  if (!employee) {
    return { isWorkingDay: false, expectedMinutes: 0, detail: 'Employee not found' };
  }

  // 1. Join / Exit Lifecycle Check
  if (employee.dateOfJoining && workDate < employee.dateOfJoining) {
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'BEFORE_JOINING',
      detail: 'Before date of joining',
    };
  }

  if (employee.dateOfLeaving && workDate > employee.dateOfLeaving) {
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'AFTER_LEAVING',
      detail: 'After date of leaving',
    };
  }

  // 2. Approved Leave Check
  const approvedLeave = await tx.leaveRequest.findFirst({
    where: {
      organizationId,
      employeeId,
      status: 'APPROVED',
      startDate: { lte: workDate },
      endDate: { gte: workDate },
    },
    include: { leaveType: { select: { name: true, paid: true } } },
  });

  let approvedUnits = approvedLeave ? leaveUnitsOn(approvedLeave, workDate) : 0;
  if (approvedUnits > 0 && approvedUnits < 1) {
    const requests = await tx.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId,
        status: 'APPROVED',
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      },
    });
    approvedUnits = Math.min(
      1,
      requests.reduce((sum, request) => sum + leaveUnitsOn(request, workDate), 0),
    );
  }
  if (approvedLeave && approvedUnits === 1)
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'ON_LEAVE',
      detail: 'On approved leave: ' + approvedLeave.leaveType.name,
    };

  // 3. Holiday Check (Mandatory and Selected Optional)
  const branchId = employee.primaryBranchId;
  const mandatoryHoliday = await tx.holiday.findFirst({
    where: {
      organizationId,
      isActive: true,
      isOptional: false,
      holidayDate: workDate,
      OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
    },
    select: { name: true },
  });

  if (mandatoryHoliday) {
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'HOLIDAY',
      detail: `Public holiday: ${mandatoryHoliday.name}`,
    };
  }

  const optionalHoliday = await tx.employeeHolidaySelection.findFirst({
    where: {
      organizationId,
      employeeId,
      status: 'CONFIRMED',
      holiday: { isActive: true, holidayDate: workDate },
    },
    include: { holiday: { select: { name: true } } },
  });

  if (optionalHoliday) {
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'HOLIDAY',
      detail: `Optional holiday: ${optionalHoliday.holiday.name}`,
    };
  }

  // 4. Shift Schedule Check
  const shiftAssignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      organizationId,
      employeeId,
      startsOn: { lte: workDate },
      OR: [{ endsOn: null }, { endsOn: { gte: workDate } }],
    },
    orderBy: { startsOn: 'desc' },
    include: { shift: true },
  });

  if (shiftAssignment) {
    const weekday = ((workDate.getUTCDay() + 6) % 7) + 1; // 1=Mon, 7=Sun
    if (!shiftAssignment.shift.daysOfWeek.includes(weekday)) {
      return {
        isWorkingDay: false,
        expectedMinutes: 0,
        reason: 'WEEKLY_OFF',
        detail: `Weekly off (${DAY_NAMES[workDate.getUTCDay()]})`,
      };
    }
    const minutes = shiftMinutesOn(shiftAssignment.shift, workDate);
    return {
      isWorkingDay: true,
      expectedMinutes: Math.ceil(minutes * (1 - approvedUnits)),
      detail: shiftAssignment.shift.name,
    };
  }

  // 5. Organization schedule when no employee shift covers this date.
  const settings = await tx.organizationSettings.findUnique({ where: { organizationId } });
  if (!settings)
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      detail: 'Organization calendar is not configured',
    };
  const dayOfWeek = workDate.getUTCDay();
  if (!settings.workWeekDays.includes(dayOfWeek || 7)) {
    return {
      isWorkingDay: false,
      expectedMinutes: 0,
      reason: 'WEEKLY_OFF',
      detail: `Weekly off (${DAY_NAMES[dayOfWeek]})`,
    };
  }

  return {
    isWorkingDay: true,
    expectedMinutes: Math.ceil(settings.standardDayMinutes * (1 - approvedUnits)),
    detail: 'Standard working day',
  };
}
