'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Employee, type Timesheet } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { timesheetRepository } from '../repositories/timesheet.repository';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

type Loaded = { timesheets: Timesheet[]; employees: Employee[] };

/**
 * Organization-wide timesheets, for the approval queue and period management.
 *
 * Reading every employee's sheets requires `timesheets.read.all`; with only `timesheets.read`
 * the API returns just the caller's own, and the queue will show that honestly rather than
 * appearing empty for the wrong reason.
 */
export function useTimesheetAdmin() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'timesheets.read');
  const canReadAll = hasPermission(permissions, 'timesheets.read.all');
  const canDecide = hasPermission(permissions, 'timesheets.decide');
  const canWrite = hasPermission(permissions, 'timesheets.write');
  const canReadEmployees = hasPermission(permissions, 'employees.read');
  // Opening a period re-derives every employee's sheet, so the API asks for breadth as well.
  const canManagePeriods = canWrite && canReadAll;

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [timesheets, employees] = await Promise.all([
        timesheetRepository.list(organizationId!),
        canReadEmployees ? workforceRepository.listEmployees(organizationId!) : Promise.resolve([]),
      ]);
      return { timesheets, employees };
    },
    [organizationId, canReadEmployees],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const decide = useCallback(
    (timesheetId: string, status: 'APPROVED' | 'REJECTED', comment: string) =>
      run(
        () => timesheetRepository.decide(organizationId!, timesheetId, status, comment),
        'The decision could not be recorded.',
      ),
    [organizationId, run],
  );

  const createPeriod = useCallback(
    (input: { periodType: string; periodStart: string; periodEnd: string }) =>
      run(
        () => timesheetRepository.createPeriod(organizationId!, input),
        'The period could not be created.',
      ),
    [organizationId, run],
  );

  /** Builds timesheets for a period from recorded attendance. */
  const derivePeriod = useCallback(
    (periodId: string) =>
      run(
        () => timesheetRepository.derivePeriod(organizationId!, periodId),
        'The period could not be derived.',
      ),
    [organizationId, run],
  );

  /**
   * Opens a period and immediately builds its timesheets.
   *
   * One operation rather than two, because a period with no sheets derived into it helps nobody:
   * employees still see "no timesheets" and the administrator has no signal that a second step
   * was outstanding. `run` reports success as a boolean, so the period id is captured here where
   * the response is still in hand.
   */
  const openPeriod = useCallback(
    (input: { periodType: string; periodStart: string; periodEnd: string }) =>
      run(async () => {
        const period = await timesheetRepository.createPeriod(organizationId!, input);
        await timesheetRepository.derivePeriod(organizationId!, period.id);
      }, 'The period could not be opened.'),
    [organizationId, run],
  );

  return {
    timesheets: resource.data?.timesheets ?? [],
    employees: resource.data?.employees ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    decide,
    createPeriod,
    derivePeriod,
    openPeriod,
    canDecide,
    canWrite,
    canManagePeriods,
    /** False when the caller can only see their own sheets, which the queue must state. */
    canReadAll,
  };
}

export type TimesheetAdminState = ReturnType<typeof useTimesheetAdmin>;
