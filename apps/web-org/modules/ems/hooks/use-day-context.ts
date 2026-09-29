'use client';

import { useCallback, useMemo } from 'react';
import { useEmployee } from './use-employee';
import { useEmployeeHolidays } from './use-employee-holidays';
import { useHolidays } from './use-holidays';
import { useLeave } from './use-leave';
import { useWorkWeek } from './use-work-week';
import { localDateKey } from '../lib/local-date';
import { approvedLeaveByDate } from '../services/leave-calendar';
import { resolveDayStatus, type ResolvedDayStatus } from '../services/day-status';

export type EffectiveHoliday = { name: string; isOptional: boolean };

/**
 * Everything needed to say what a day was for the signed-in employee: their holidays (mandatory
 * ones plus the optional ones they confirmed), their approved leave, the organization's working
 * days and whether an unmarked working day counts as absent, and when they joined.
 *
 * The calendar, the Home work schedule and the attendance timeline read it together, so a day
 * reads the same on all three.
 */
export function useDayContext() {
  const holidays = useHolidays();
  const employeeHolidays = useEmployeeHolidays();
  const leave = useLeave();
  const { employee } = useEmployee();
  const { isWeeklyOff, unmarkedDaysAreAbsent } = useWorkWeek();
  const todayKey = localDateKey();
  const joinedOn = employee?.joinedDate ?? null;

  const holidayByDate = useMemo(() => {
    const map = new Map<string, EffectiveHoliday>();
    if (employeeHolidays.hasEmployeeRecord && employeeHolidays.summary) {
      for (const holiday of employeeHolidays.mandatoryHolidays)
        if (holiday.isActive)
          map.set(holiday.holidayDate.slice(0, 10), { name: holiday.name, isOptional: false });
      for (const selection of employeeHolidays.selections)
        if (selection.status === 'CONFIRMED' && selection.holiday?.isActive)
          map.set(selection.holiday.holidayDate.slice(0, 10), {
            name: selection.holiday.name,
            isOptional: true,
          });
    } else {
      for (const holiday of holidays.holidays)
        if (holiday.isActive && !holiday.isOptional)
          map.set(holiday.holidayDate.slice(0, 10), { name: holiday.name, isOptional: false });
    }
    return map;
  }, [
    employeeHolidays.hasEmployeeRecord,
    employeeHolidays.summary,
    employeeHolidays.mandatoryHolidays,
    employeeHolidays.selections,
    holidays.holidays,
  ]);

  const leaveByDate = useMemo(
    () => approvedLeaveByDate(leave.requests, leave.types),
    [leave.requests, leave.types],
  );

  /** What `dateKey` was, given the day's attendance record when there is one. */
  const resolve = useCallback(
    (
      dateKey: string,
      record?: { dayStatus: string; workedMinutes: number } | null,
    ): ResolvedDayStatus =>
      resolveDayStatus({
        dateKey,
        todayKey,
        recordStatus: record?.dayStatus ?? null,
        workedMinutes: record?.workedMinutes ?? 0,
        leaveName: leaveByDate.get(dateKey) ?? null,
        holidayName: holidayByDate.get(dateKey)?.name ?? null,
        isWeeklyOff: isWeeklyOff(new Date(`${dateKey}T00:00:00`)),
        unmarkedDaysAreAbsent,
        joinedOn,
      }),
    [todayKey, leaveByDate, holidayByDate, isWeeklyOff, unmarkedDaysAreAbsent, joinedOn],
  );

  return { todayKey, holidayByDate, leaveByDate, isWeeklyOff, resolve };
}
