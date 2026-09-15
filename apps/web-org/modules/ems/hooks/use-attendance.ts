'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hasPermission,
  isCheckedIn as derivedCheckedIn,
  openCheckInAt,
  parseCheckInHolidayConflict,
  workDateKey,
  type HolidayConflict,
  type AttendanceRecord,
  type AttendancePreferences,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';
import { toAttendanceDayViews, type AttendanceDayView } from '../services/attendance-view';
import { holidayConflictsRepository } from '../repositories/holiday-conflicts.repository';
import { holidayConflictsByRecord } from '../services/holiday-conflict-view';
import { announceHolidayCheckIn, emitDataChanged, useDataChanged } from '../lib/data-events';

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
/**
 * `window` narrows the records to a date range a screen is showing — a week on the summary, a
 * month on the calendar. Without one the hook reads the last `rangeDays`, which is what the
 * check-in controls and Home need.
 */
export function useAttendance(rangeDays = 30, window?: { from: string; to: string }) {
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

  const from = window?.from ?? daysAgo(rangeDays);
  const to = window?.to ?? localDateKey();

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

  // Check-ins on the employee's approved optional holidays in the same window, so those days are
  // shown by their review state rather than as an ordinary present day.
  const conflictsResource = useAsyncResource<HolidayConflict[]>(
    () => holidayConflictsRepository.list(organizationId!, { from, to }),
    [organizationId, employeeId, from, to],
    { enabled: Boolean(organizationId && employeeId) && canRead },
  );
  const holidayConflicts = useMemo(
    () => holidayConflictsByRecord(conflictsResource.data ?? []),
    [conflictsResource.data],
  );
  const refetchAll = useCallback(async () => {
    await Promise.all([resource.refetch(), conflictsResource.refetch()]);
  }, [resource, conflictsResource]);
  // A decision on another screen changes these days; read them again when one is announced.
  useDataChanged(['attendance', 'holidays'], refetchAll);

  const preferencesResource = useAsyncResource<AttendancePreferences>(
    () => attendanceRepository.getPreferences(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const sessionMode = preferencesResource.data?.attendanceSessionMode ?? 'SINGLE';

  const todayKey = localDateKey();
  const todayRecord = useMemo(
    () => records.find((record) => workDateKey(record) === todayKey) ?? null,
    [records, todayKey],
  );

  const checkedIn = derivedCheckedIn(todayRecord);
  const checkInTimestamp = openCheckInAt(todayRecord);
  const isDayCompleted = Boolean(todayRecord && todayRecord.status === 'COMPLETED' && !checkedIn);

  // Live timer or completed day duration
  useEffect(() => {
    if (checkInTimestamp) {
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
    }

    if (todayRecord && todayRecord.workedMinutes > 0) {
      const totalSec = todayRecord.workedMinutes * 60;
      setTimerDisplay({
        hrs: String(Math.floor(totalSec / 3600)).padStart(2, '0'),
        mins: String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0'),
        secs: '00',
        totalSeconds: totalSec,
      });
      return;
    }

    setTimerDisplay(ZERO_TIMER);
  }, [checkInTimestamp, todayRecord]);

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
        await refetchAll();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'The punch could not be recorded.');
        await refetchAll();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, employeeId, refetchAll],
  );

  const punch = useCallback(
    (direction: 'IN' | 'OUT') =>
      run(async () => {
        const now = new Date();
        const input = {
          employeeId: employeeId!,
          occurredAt: now.toISOString(),
          workDate: localDateKey(now),
        };
        const reply =
          direction === 'IN'
            ? await attendanceRepository.checkIn(organizationId!, input)
            : await attendanceRepository.checkOut(organizationId!, input);
        // The check-in is recorded either way. When it landed on an approved optional holiday the
        // API says so, and the employee is asked for a reason straight away.
        const conflict = parseCheckInHolidayConflict(reply);
        if (direction === 'IN' && conflict?.state === 'AWAITING_REASON')
          announceHolidayCheckIn(conflict);
      }),
    [employeeId, organizationId, run],
  );

  const checkIn = useCallback(() => punch('IN'), [punch]);
  const checkOut = useCallback(() => punch('OUT'), [punch]);

  /**
   * Raises a correction request, rejecting with the API's own reason when it is refused.
   *
   * The correction drawers own their saving and error state and wait on this promise. It used to
   * go through `run`, which resolves `false` and parks the message in state; the screens then
   * threw from a `saveError` captured before the request, so the drawer said "could not be
   * submitted" instead of what the API said — for example that the reason was too short.
   */
  const requestCorrection = useCallback(
    async (attendanceId: string, reason: string) => {
      if (!organizationId || !employeeId)
        throw new Error('This account has no employee record, so attendance cannot be recorded.');
      try {
        await attendanceRepository.requestCorrection(organizationId, attendanceId, reason);
      } finally {
        // As `run` does, on failure too: show the records as the server holds them.
        await resource.refetch();
      }
    },
    [employeeId, organizationId, resource],
  );

  /** Asks for a day's missing check-out to be added; rejects with the API's reason. */
  const requestMissingCheckOut = useCallback(
    async (attendanceId: string, checkOutAt: string, reason: string) => {
      if (!organizationId || !employeeId)
        throw new Error('This account has no employee record, so attendance cannot be recorded.');
      try {
        await attendanceRepository.requestMissingCheckOut(
          organizationId,
          attendanceId,
          checkOutAt,
          reason,
        );
      } finally {
        await resource.refetch();
      }
    },
    [employeeId, organizationId, resource],
  );

  /** Explains a check-in on an approved optional holiday; rejects with the API's reason. */
  const explainHolidayCheckIn = useCallback(
    async (attendanceId: string, reason: string, comment?: string) => {
      if (!organizationId) throw new Error('No organization is selected.');
      try {
        await holidayConflictsRepository.explain(organizationId, attendanceId, {
          reason,
          ...(comment ? { comment } : {}),
        });
        emitDataChanged('approvals');
      } finally {
        await refetchAll();
      }
    },
    [organizationId, refetchAll],
  );

  // Presentation shape the screens render, derived from the same records.
  const days: AttendanceDayView[] = useMemo(
    () => toAttendanceDayViews(records, todayKey, [], holidayConflicts),
    [records, todayKey, holidayConflicts],
  );

  return {
    records,
    days,
    todayRecord,
    isCheckedIn: checkedIn,
    isDayCompleted,
    sessionMode,
    canCheckInAgain: sessionMode === 'MULTIPLE' || !isDayCompleted,
    checkInTimestamp,
    timerDisplay,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: refetchAll,
    saving,
    saveError,
    checkIn,
    checkOut,
    requestCorrection,
    requestMissingCheckOut,
    explainHolidayCheckIn,
    canRead,
    canWrite,
    canRequestCorrection,
    /** True when the signed-in user has no employee record, so punching is impossible. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type AttendanceState = ReturnType<typeof useAttendance>;
