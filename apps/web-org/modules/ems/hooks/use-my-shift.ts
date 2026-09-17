'use client';

import { hasPermission, type CurrentShiftAssignment } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { localDateKey } from './use-attendance';
import { shiftsRepository } from '../repositories/shifts.repository';
import type { ShiftInfo } from '../types/shift.types';

/** `09:30:00` → `09:30`; the API sends the shift's own wall-clock times. */
const hhmm = (time: string) => time.slice(0, 5);

/**
 * The shift the signed-in employee is assigned to today, as the API holds it.
 *
 * `shift` is null both while loading and when no shift is assigned; `assigned` tells them apart,
 * so the card never presents "no shift" before the answer has arrived.
 */
export function useMyShift() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const canRead = hasPermission(persona?.permissions ?? [], 'shifts.read');
  const today = localDateKey();

  const resource = useAsyncResource<CurrentShiftAssignment>(
    () => shiftsRepository.current(organizationId!, today),
    [organizationId, session?.employeeId, today],
    { enabled: Boolean(organizationId && session?.employeeId) && canRead },
  );

  const assignment = resource.data;
  const shift: ShiftInfo | null = assignment
    ? {
        id: assignment.shift.id,
        code: assignment.shift.code,
        name: assignment.shift.name,
        startsAt: hhmm(assignment.shift.startsAt),
        endsAt: hhmm(assignment.shift.endsAt),
      }
    : null;

  return {
    shift,
    loading: resource.loading,
    error: resource.error,
    /** The API answered and there is no assignment for today. */
    unassigned: !resource.loading && !resource.error && resource.data === null && canRead,
  };
}
