'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type Holiday } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { holidaysRepository, type HolidayInput } from '../repositories/holidays.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The organization's holiday calendar.
 *
 * The year is a server-side filter, not a client-side one: the API bounds the query by date, so
 * changing the year refetches rather than slicing a full download.
 */
export function useHolidays() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'organizations.read');
  const canWrite = hasPermission(permissions, 'organizations.update');

  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const resource = useAsyncResource<Holiday[]>(
    () =>
      holidaysRepository.list(organizationId!, {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      }),
    [organizationId, year],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, setSaveError, run } = useMutationRunner(resource.refetch);

  const createHoliday = useCallback(
    (input: HolidayInput) =>
      run(
        () => holidaysRepository.create(organizationId!, input),
        'The holiday could not be added.',
      ),
    [organizationId, run],
  );

  const renameHoliday = useCallback(
    (holidayId: string, input: { name?: string; isOptional?: boolean }) =>
      run(
        () => holidaysRepository.update(organizationId!, holidayId, input),
        'The holiday could not be updated.',
      ),
    [organizationId, run],
  );

  const retireHoliday = useCallback(
    (holidayId: string, reason: string) =>
      run(
        () => holidaysRepository.deactivate(organizationId!, holidayId, reason),
        'The holiday could not be retired.',
      ),
    [organizationId, run],
  );

  return {
    holidays: useMemo(() => resource.data ?? [], [resource.data]),
    year,
    setYear,
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: resource.refetch,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createHoliday,
    renameHoliday,
    retireHoliday,
    canWrite,
  };
}

export type HolidaysState = ReturnType<typeof useHolidays>;
