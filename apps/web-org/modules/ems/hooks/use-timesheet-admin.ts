'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Employee, type Timesheet } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { timesheetRepository } from '../repositories/timesheet.repository';
import { employeeReadRepository } from '../repositories/employee-read.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import { useCursorPages } from './use-cursor-pages';

type Loaded = {
  timesheets: Timesheet[];
  employees: Employee[];
  summary?: {
    statusCounts: Record<string, { count: number; totalMinutes: number }>;
    totalCount: number;
    totalMinutes: number;
  };
};

/**
 * Organization-wide timesheets, for the approval queue and period management.
 *
 * Reading every employee's sheets requires `timesheets.read.all`; with only `timesheets.read`
 * the API returns just the caller's own, and the queue will show that honestly rather than
 * appearing empty for the wrong reason.
 */
export function useTimesheetAdmin(
  filters: {
    status?: string;
    departmentId?: string;
    employeeId?: string;
    from?: string;
    to?: string;
    search?: string;
  } = {},
) {
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

  const paging = useCursorPages(
    JSON.stringify([
      organizationId,
      filters.status,
      filters.departmentId,
      filters.employeeId,
      filters.from,
      filters.to,
      filters.search,
    ]),
  );
  const resource = useAsyncResource<Loaded & { nextCursor?: string }>(
    async () => {
      const page = await timesheetRepository.listPage(organizationId!, {
        ...filters,
        status: filters.status === 'ALL' ? undefined : filters.status,
        cursor: paging.cursor,
        limit: 10,
      });
      const timesheets = page.timesheets;
      const employees = canReadEmployees
        ? await employeeReadRepository.identities(
            organizationId!,
            timesheets.map((sheet) => sheet.employeeId),
          )
        : [];
      return { timesheets, employees, nextCursor: page.nextCursor, summary: page.summary };
    },
    [
      organizationId,
      canReadEmployees,
      paging.cursor,
      filters.status,
      filters.departmentId,
      filters.employeeId,
      filters.from,
      filters.to,
      filters.search,
    ],
    {
      enabled: Boolean(organizationId) && canRead,
      preservePreviousDataKey: organizationId,
    },
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
    summary: resource.data?.summary,
    nextCursor: resource.data?.nextCursor,
    paging,
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
