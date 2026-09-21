'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository, type WorkWeek } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource<WorkWeek>(
    () => attendanceRepository.getWorkWeek(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const workWeekDays = resource.data?.workWeekDays.length
    ? resource.data.workWeekDays
    : DEFAULT_WORK_WEEK;
  const unmarkedDaysAreAbsent = resource.data?.unmarkedDaysAreAbsent ?? true;

  const save = useCallback(
    async (week: WorkWeek) => {
      if (!organizationId) return false;
      setSaving(true);
      setSaveError(null);
      try {
        await attendanceRepository.saveWorkWeek(organizationId, week);
        await resource.refetch();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'The working days were not saved.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, resource],
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
  };
}
