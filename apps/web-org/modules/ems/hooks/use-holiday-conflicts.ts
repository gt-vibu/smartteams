'use client';

import { useMemo } from 'react';
import { hasPermission, type HolidayConflict } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { holidayConflictsRepository } from '../repositories/holiday-conflicts.repository';
import { useDataChanged } from '../lib/data-events';
import { toHolidayConflictView, type HolidayConflictView } from '../services/holiday-conflict-view';

/**
 * The signed-in employee's check-ins on their approved optional holidays in a date range, keyed by
 * holiday — for the holiday calendar, which lists holidays rather than attendance days.
 */
export function useHolidayConflicts(window: { from: string; to: string }) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const canRead = hasPermission(persona?.permissions ?? [], 'attendance.read');

  const resource = useAsyncResource<HolidayConflict[]>(
    () => holidayConflictsRepository.list(organizationId!, window),
    [organizationId, window.from, window.to],
    { enabled: Boolean(organizationId && session?.employeeId) && canRead },
  );
  useDataChanged(['attendance', 'holidays'], resource.refetch);

  const byHoliday = useMemo(
    () =>
      new Map<string, HolidayConflictView>(
        (resource.data ?? []).map((conflict) => [
          conflict.holiday.id,
          toHolidayConflictView(conflict),
        ]),
      ),
    [resource.data],
  );
  return { byHoliday, error: resource.error };
}
