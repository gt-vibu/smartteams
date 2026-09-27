'use client';

import { useCallback } from 'react';
import { hasPermission, type ShiftAssignment } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { shiftsRepository } from '../repositories/shifts.repository';

/**
 * Which shift an employee was on for a given day, from their assignment history.
 *
 * An attendance record does not store its shift, so the day's shift is the assignment whose
 * dates cover it. Nothing is assumed when no assignment does: `shiftOn` answers null and the
 * screen says the shift is not recorded.
 */
export function useShiftHistory(employeeId: string | null) {
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

  const assignments = resource.data;
  return useCallback(
    (dateKey: string): string | null =>
      assignments?.find(
        (assignment) =>
          assignment.startsOn <= dateKey && (!assignment.endsOn || assignment.endsOn >= dateKey),
      )?.shift.name ?? null,
    [assignments],
  );
}
