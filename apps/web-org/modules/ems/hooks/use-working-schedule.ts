'use client';

import { useCallback } from 'react';
import { isoWeekday, useWorkWeek } from './use-work-week';
import { useShiftSchedule } from './use-shift-history';

/** An assigned shift takes precedence over the organization week, as it does on the server. */
export function useWorkingSchedule(employeeId: string | null) {
  const week = useWorkWeek();
  const { shiftOnDate, ready: shiftReady } = useShiftSchedule(employeeId);
  const isWeeklyOffOn = useCallback((dateKey: string) => {
    const days = shiftOnDate(dateKey)?.daysOfWeek ?? week.workWeekDays;
    const weekday = isoWeekday(new Date(`${dateKey.slice(0, 10)}T00:00:00.000Z`).getUTCDay());
    return !days.includes(weekday);
  }, [shiftOnDate, week.workWeekDays]);
  return { ...week, ready: week.ready && shiftReady, shiftOnDate, isWeeklyOffOn };
}
