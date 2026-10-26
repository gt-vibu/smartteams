'use client';

import { useCallback } from 'react';
import { hasPermission, type ShiftAssignment } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { shiftsRepository } from '../repositories/shifts.repository';
import { useDataChanged } from '../lib/data-events';

/**
 * Which shift an employee was on for a given day, from their assignment history.
 *
 * An attendance record does not store its shift, so the day's shift is the assignment whose
 * dates cover it. Nothing is assumed when no assignment does: `shiftOn` answers null and the
 * screen says the shift is not recorded.
 */
export function useShiftSchedule(employeeId: string | null) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const canRead = hasPermission(persona?.permissions ?? [], 'shifts.read');

  const resource = useAsyncResource<ShiftAssignment[]>(
    async () =>
      (
        await shiftsRepository.assignments(organizationId!, {
          employeeId: employeeId!,
          includeEnded: true,
          limit: 500,
        })
      ).items,
    [organizationId, employeeId],
    { enabled: Boolean(organizationId && employeeId) && canRead },
  );
  useDataChanged(['workforce'], resource.refetch);

  const assignments = resource.data;
  const shiftOnDate = useCallback(
    (dateKey: string): ShiftAssignment['shift'] | null =>
      assignments?.find(
        (assignment) =>
          assignment.startsOn <= dateKey && (!assignment.endsOn || assignment.endsOn >= dateKey),
      )?.shift ?? null,
    [assignments],
  );
  return {
    shiftOnDate,
    ready: !canRead || !employeeId || (resource.data !== null && !resource.error),
  };
}

export function useShiftOnDate(employeeId: string | null) {
  return useShiftSchedule(employeeId).shiftOnDate;
}

export function useShiftHistory(employeeId: string | null) {
  const shiftOnDate = useShiftOnDate(employeeId);
  return useCallback((dateKey: string) => shiftOnDate(dateKey)?.name ?? null, [shiftOnDate]);
}
