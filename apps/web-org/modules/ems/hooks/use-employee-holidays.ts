'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EmployeeHolidaySummary } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useEmployee } from './use-employee';
import { holidaysRepository } from '../repositories/holidays.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * Employee self-service for floating/optional holiday summary and selection.
 *
 * Scoped to the authenticated employee's tenant and identity.
 */
export function useEmployeeHolidays() {
  const { session } = useSession();
  const { employee } = useEmployee();
  const organizationId = session?.organizationId || null;
  const hasEmployeeRecord = Boolean(employee);

  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const resource = useAsyncResource<EmployeeHolidaySummary>(
    () => holidaysRepository.getMySummary(organizationId!, year),
    [organizationId, year],
    { enabled: Boolean(organizationId) && hasEmployeeRecord },
  );

  const { saving, saveError, setSaveError, run } = useMutationRunner(resource.refetch);

  const selectHolidays = useCallback(
    (holidayIds: string[]) =>
      run(
        () => holidaysRepository.selectHolidays(organizationId!, holidayIds),
        'Could not select the holiday.',
      ),
    [organizationId, run],
  );

  const cancelSelection = useCallback(
    (holidayId: string) =>
      run(
        () => holidaysRepository.cancelSelection(organizationId!, holidayId),
        'Could not cancel the holiday selection.',
      ),
    [organizationId, run],
  );

  const cancelMultipleSelections = useCallback(
    (holidayIds: string[]) =>
      run(async () => {
        for (const holidayId of holidayIds) {
          await holidaysRepository.cancelSelection(organizationId!, holidayId);
        }
      }, 'Could not cancel the holiday selection(s).'),
    [organizationId, run],
  );

  const summary = resource.data ?? null;

  return {
    summary,
    allowance: summary?.allowance ?? 0,
    selectedCount: summary?.usedCount ?? 0,
    remainingAllowance: summary?.remainingCount ?? 0,
    mandatoryHolidays: useMemo(() => summary?.mandatory ?? [], [summary?.mandatory]),
    optionalPool: useMemo(() => summary?.optionalPool ?? [], [summary?.optionalPool]),
    selections: useMemo(() => summary?.selections ?? [], [summary?.selections]),
    year,
    setYear,
    loading: resource.loading,
    error: resource.error,
    hasEmployeeRecord,
    refetch: resource.refetch,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    selectHolidays,
    cancelSelection,
    cancelMultipleSelections,
  };
}

export type EmployeeHolidaysState = ReturnType<typeof useEmployeeHolidays>;
