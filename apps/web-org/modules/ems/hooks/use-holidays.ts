'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type Holiday,
  type HolidaySettings,
  type EmployeeHolidaySelection,
  type EmployeeHolidayPolicy,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  holidaysRepository,
  type HolidayInput,
  type EmployeeHolidayPolicyInput,
} from '../repositories/holidays.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import { useDataChanged } from '../lib/data-events';

/**
 * The organization's holiday calendar and administration.
 *
 * The year is a server-side filter, not a client-side one: the API bounds the query by date, so
 * changing the year refetches rather than slicing a full download.
 *
 * Policy resolution (tiered):
 *  - allowanceOverride != null → use that, else use org optionalHolidayAllowance
 *  - restrictedHolidayIds non-empty → employee sees only those, else full pool
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

  const settingsResource = useAsyncResource<HolidaySettings>(
    () => holidaysRepository.getSettings(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const selectionsResource = useAsyncResource<EmployeeHolidaySelection[]>(
    () => holidaysRepository.listSelections(organizationId!, { year }),
    [organizationId, year],
    { enabled: Boolean(organizationId) && canRead },
  );

  const employeePoliciesResource = useAsyncResource<EmployeeHolidayPolicy[]>(
    () => holidaysRepository.listEmployeePolicies(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead && canWrite },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([
      resource.refetch(),
      settingsResource.refetch(),
      selectionsResource.refetch(),
      employeePoliciesResource.refetch(),
    ]);
  }, [resource, settingsResource, selectionsResource, employeePoliciesResource]);

  const { saving, saveError, setSaveError, run } = useMutationRunner(refetchAll);
  useDataChanged(['holidays'], refetchAll);

  const createHoliday = useCallback(
    (input: HolidayInput) =>
      run(
        () => holidaysRepository.create(organizationId!, input),
        'The holiday could not be added.',
      ),
    [organizationId, run],
  );

  /**
   * Creates one holiday row per calendar day between startDate and endDate (inclusive).
   * Holidays that already exist on a date are silently skipped (the API returns 409).
   * Returns true if at least one holiday was created.
   */
  const createHolidayRange = useCallback(
    (input: Omit<HolidayInput, 'holidayDate'>, startDate: string, endDate: string) =>
      run(async () => {
        const dates = enumerateDates(startDate, endDate);
        if (dates.length === 0) throw new Error('Invalid date range');
        // Create each day sequentially; skip 409-conflict dates
        for (const date of dates) {
          try {
            await holidaysRepository.create(organizationId!, { ...input, holidayDate: date });
          } catch {
            // A date in range already has a holiday — skip silently
          }
        }
        return true;
      }, 'One or more holiday days could not be added.'),
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

  const renameHolidayGroup = useCallback(
    (holidayIds: string[], input: { name?: string; isOptional?: boolean }) =>
      run(async () => {
        for (const holidayId of holidayIds) {
          await holidaysRepository.update(organizationId!, holidayId, input);
        }
      }, 'One or more holidays could not be updated.'),
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

  const retireHolidayGroup = useCallback(
    (holidayIds: string[], reason: string) =>
      run(async () => {
        for (const holidayId of holidayIds) {
          await holidaysRepository.deactivate(organizationId!, holidayId, reason);
        }
      }, 'One or more holidays could not be retired.'),
    [organizationId, run],
  );

  const updateAllowance = useCallback(
    (allowance: number) =>
      run(
        () =>
          holidaysRepository.updateSettings(organizationId!, {
            optionalHolidayAllowance: allowance,
          }),
        'The holiday allowance could not be updated.',
      ),
    [organizationId, run],
  );

  const upsertEmployeePolicy = useCallback(
    (employeeId: string, input: EmployeeHolidayPolicyInput) =>
      run(
        () => holidaysRepository.upsertEmployeePolicy(organizationId!, employeeId, input),
        'The employee holiday policy could not be saved.',
      ),
    [organizationId, run],
  );

  const deleteEmployeePolicy = useCallback(
    (employeeId: string) =>
      run(
        () => holidaysRepository.deleteEmployeePolicy(organizationId!, employeeId),
        'The employee holiday policy could not be removed.',
      ),
    [organizationId, run],
  );

  return {
    holidays: useMemo(() => resource.data ?? [], [resource.data]),
    settings: settingsResource.data ?? { optionalHolidayAllowance: 0 },
    selections: useMemo(() => selectionsResource.data ?? [], [selectionsResource.data]),
    employeePolicies: useMemo(
      () => employeePoliciesResource.data ?? [],
      [employeePoliciesResource.data],
    ),
    year,
    setYear,
    loading: resource.loading || settingsResource.loading,
    error: resource.error || settingsResource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: refetchAll,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createHoliday,
    createHolidayRange,
    renameHoliday,
    renameHolidayGroup,
    retireHoliday,
    retireHolidayGroup,
    updateAllowance,
    upsertEmployeePolicy,
    deleteEmployeePolicy,
    canWrite,
  };
}

export type HolidaysState = ReturnType<typeof useHolidays>;

/**
 * Returns all YYYY-MM-DD date strings between start and end (inclusive).
 * Produces at most 365 dates to prevent accidental huge ranges.
 */
function enumerateDates(start: string, end: string): string[] {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  const dates: string[] = [];
  const cursor = new Date(s);
  while (cursor <= e && dates.length < 365) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
