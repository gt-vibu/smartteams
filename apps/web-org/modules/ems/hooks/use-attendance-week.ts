'use client';

import { useCallback, useMemo, useState } from 'react';
import { formatDateRange } from '../utils/formatters';
import { localDateKey } from './use-attendance';

export type DateWindow = { from: string; to: string };

/**
 * The Monday-to-Sunday week `weeksBack` weeks before the one containing `todayKey`.
 *
 * Pure so the week arithmetic is testable on its own. Dates are `YYYY-MM-DD` in the employee's
 * own calendar and the arithmetic is done in UTC, so no timezone offset can move a day.
 */
export function attendanceWeek(todayKey: string, weeksBack: number): DateWindow {
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - sinceMonday - weeksBack * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/**
 * The week the Attendance Summary is showing, and the arrows that move it.
 *
 * The arrows used to be permanently disabled — no screen passed them a handler — while the label
 * summarised whatever records the fixed thirty-day fetch returned. Now the label is the week being
 * shown, the previous arrow goes back a week at a time, and the next arrow stops at the current
 * week because there is nothing recorded in the future.
 */
export function useAttendanceWeek() {
  const [weeksBack, setWeeksBack] = useState(0);
  const todayKey = localDateKey();
  const window = useMemo(() => attendanceWeek(todayKey, weeksBack), [todayKey, weeksBack]);

  const previous = useCallback(() => setWeeksBack((current) => current + 1), []);
  const next = useCallback(() => setWeeksBack((current) => Math.max(0, current - 1)), []);

  return {
    window,
    label: formatDateRange(window.from, window.to),
    previous,
    /** Absent on the current week, which disables the arrow. */
    next: weeksBack > 0 ? next : undefined,
  };
}
