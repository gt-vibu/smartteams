'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hasPermission,
  isCheckedIn as derivedCheckedIn,
  openCheckInAt,
  workDateKey,
  type AttendanceRecord,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';
import { toAttendanceDayViews, type AttendanceDayView } from '../services/attendance-view';

/** Local calendar date as `YYYY-MM-DD`; attendance is recorded in the employee's own day. */
export function localDateKey(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

export type TimerDisplay = { hrs: string; mins: string; secs: string; totalSeconds: number };

const ZERO_TIMER: TimerDisplay = { hrs: '00', mins: '00', secs: '00', totalSeconds: 0 };

/**
 * The signed-in employee's own attendance.
 *
 * Check-in state is derived from the punch sequence the server returned, not from a local flag,
 * so a punch made on another device is reflected here after a refetch. The previous version kept
 * the whole thing in `localStorage`, where a punch was invisible to everyone else.
 */
export function useAttendance(rangeDays = 30) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'attendance.read');
  const canWrite = hasPermission(permissions, 'attendance.write');
  const canRequestCorrection = hasPermission(permissions, 'attendance.corrections.write');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timerDisplay, setTimerDisplay] = useState<TimerDisplay>(ZERO_TIMER);

  const from = daysAgo(rangeDays);
  const to = localDateKey();

  const resource = useAsyncResource<AttendanceRecord[]>(
    async () => {
      const page = await attendanceRepository.list(organizationId!, {
        employeeId: employeeId!,
        from,
        to,
      });
      return page.records;
    },
    [organizationId, employeeId, from, to],
    { enabled: Boolean(organizationId && employeeId) && canRead },
  );

  const records = useMemo(() => resource.data ?? [], [resource.data]);

  const todayKey = localDateKey();
  const todayRecord = useMemo(
    () => records.find((record) => workDateKey(record) === todayKey) ?? null,
    [records, todayKey],
  );

  const checkedIn = derivedCheckedIn(todayRecord);
  const checkInTimestamp = openCheckInAt(todayRecord);

  // Live timer, driven purely by the open punch's timestamp.
  useEffect(() => {
    if (!checkInTimestamp) {
      setTimerDisplay(ZERO_TIMER);
      return;
    }
    const tick = () => {
      const started = new Date(checkInTimestamp).getTime();
      const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      setTimerDisplay({
        hrs: String(Math.floor(seconds / 3600)).padStart(2, '0'),
        mins: String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'),
        secs: String(seconds % 60).padStart(2, '0'),
        totalSeconds: seconds,
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [checkInTimestamp]);

  const run = useCallback(
    async (operation: () => Promise<unknown>) => {
      if (!organizationId || !employeeId) {
        setSaveError('This account has no employee record, so attendance cannot be recorded.');
        return false;
      }
      setSaving(true);
      setSaveError(null);
      try {
        await operation();
        await resource.refetch();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'The punch could not be recorded.');
        await resource.refetch();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, employeeId, resource],
  );

  const punch = useCallback(
    (direction: 'IN' | 'OUT') =>
      run(() => {
        const now = new Date();
        const input = {
          employeeId: employeeId!,
          occurredAt: now.toISOString(),
          workDate: localDateKey(now),
        };
        return direction === 'IN'
          ? attendanceRepository.checkIn(organizationId!, input)
          : attendanceRepository.checkOut(organizationId!, input);
      }),
    [employeeId, organizationId, run],
  );

  const checkIn = useCallback(() => punch('IN'), [punch]);
  const checkOut = useCallback(() => punch('OUT'), [punch]);

  /** Raises a correction request. The API rejects a reason under ten characters. */
  const requestCorrection = useCallback(
    (attendanceId: string, reason: string) =>
      run(() => attendanceRepository.requestCorrection(organizationId!, attendanceId, reason)),
    [organizationId, run],
  );

  // Presentation shape the screens render, derived from the same records.
  const days: AttendanceDayView[] = useMemo(
    () => toAttendanceDayViews(records, todayKey),
    [records, todayKey],
  );

  return {
    records,
    days,
    todayRecord,
    isCheckedIn: checkedIn,
    checkInTimestamp,
    timerDisplay,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    checkIn,
    checkOut,
    requestCorrection,
    canRead,
    canWrite,
    canRequestCorrection,
    /** True when the signed-in user has no employee record, so punching is impossible. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type AttendanceState = ReturnType<typeof useAttendance>;
