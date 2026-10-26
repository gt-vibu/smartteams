'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository, type WorkWeek } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';
import { emitDataChanged, useDataChanged } from '../lib/data-events';

/** Monday to Friday: what the server stores for an organization that has never changed it. */
export const DEFAULT_WORK_WEEK = [1, 2, 3, 4, 5];

/** ISO weekday (1 Monday … 7 Sunday) of a JavaScript `Date#getDay()` value (0 Sunday). */
export const isoWeekday = (jsDay: number) => (jsDay === 0 ? 7 : jsDay);

/**
 * The organization's working days. Screens use it to mark weekly offs, and administrators edit
 * it from the attendance policy. Payroll and leave read the same setting on the server.
 */
export function useWorkWeek() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canWrite = hasPermission(permissions, 'attendance.preferences.write');
  const canRead = canWrite || ['attendance.read', 'attendance.preferences.read', 'organizations.read']
    .some((permission) => hasPermission(permissions, permission));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource<WorkWeek>(
    () => attendanceRepository.getWorkWeek(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  const { refetch } = resource;
  useDataChanged(['work-week'], refetch);
  // Pick up a schedule edited by an administrator in another browser when returning to this tab.
  useEffect(() => {
    if (!organizationId || !canRead) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [organizationId, canRead, refetch]);
  const workWeekDays = resource.data?.workWeekDays.length
    ? resource.data.workWeekDays
    : DEFAULT_WORK_WEEK;
  const unmarkedDaysAreAbsent = resource.data?.unmarkedDaysAreAbsent ?? true;
  const observed = useRef<{ organizationId: string | null; signature: string } | null>(null);
  useEffect(() => {
    if (!resource.data) return;
    const signature = `${resource.data.workWeekDays.join(',')}:${resource.data.unmarkedDaysAreAbsent}`;
    const previous = observed.current;
    observed.current = { organizationId, signature };
    if (previous?.organizationId === organizationId && previous.signature !== signature)
      emitDataChanged('attendance', 'leave', 'timesheets', 'payroll');
  }, [organizationId, resource.data]);

  const save = useCallback(
    async (week: WorkWeek) => {
      if (!organizationId || !canWrite) return false;
      setSaving(true);
      setSaveError(null);
      try {
        await attendanceRepository.saveWorkWeek(organizationId, week);
        emitDataChanged('work-week');
        await refetch();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'The working days were not saved.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, canWrite, refetch],
  );

  const isWeeklyOff = useCallback(
    (date: Date) => !workWeekDays.includes(isoWeekday(date.getDay())),
    [workWeekDays],
  );

  return {
    workWeekDays,
    unmarkedDaysAreAbsent,
    isWeeklyOff,
    canWrite,
    save,
    saving,
    saveError,
    loading: resource.loading,
    error: resource.error,
    ready: resource.data !== null && !resource.error,
    refetch,
  };
}
