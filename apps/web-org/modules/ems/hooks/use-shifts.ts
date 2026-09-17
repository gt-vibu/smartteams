'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Shift } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { shiftsRepository, type ShiftInput } from '../repositories/shifts.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The organisation's shifts and their assignment to employees.
 *
 * Every operation here already existed on the backend; nothing was added for the screen. The API
 * enforces branch scope, and refuses an employee assignment that overlaps one already in place.
 */
export function useShifts() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'shifts.read');
  const canWrite = hasPermission(permissions, 'shifts.write');

  const resource = useAsyncResource<Shift[]>(
    () => shiftsRepository.list(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, setSaveError, run } = useMutationRunner(resource.refetch);

  const createShift = useCallback(
    (input: ShiftInput) =>
      run(() => shiftsRepository.create(organizationId!, input), 'The shift could not be created.'),
    [organizationId, run],
  );

  const updateShift = useCallback(
    (shiftId: string, input: Partial<ShiftInput>) =>
      run(
        () => shiftsRepository.update(organizationId!, shiftId, input),
        'The shift could not be updated.',
      ),
    [organizationId, run],
  );

  const retireShift = useCallback(
    (shiftId: string, reason: string) =>
      run(
        () => shiftsRepository.deactivate(organizationId!, shiftId, reason),
        'The shift could not be retired.',
      ),
    [organizationId, run],
  );

  const assignShift = useCallback(
    (
      employeeId: string,
      input: { shiftId: string; branchId?: string; startsOn: string; endsOn?: string },
    ) =>
      run(
        () => shiftsRepository.assign(organizationId!, employeeId, input),
        'The shift could not be assigned.',
      ),
    [organizationId, run],
  );

  return {
    shifts: useMemo(() => resource.data ?? [], [resource.data]),
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: resource.refetch,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createShift,
    updateShift,
    retireShift,
    assignShift,
    canWrite,
  };
}

export type ShiftsState = ReturnType<typeof useShifts>;
