'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Timesheet } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { timesheetRepository, type ManualEntryInput } from '../repositories/timesheet.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import {
  latestApproved,
  summarize,
  toDayGroups,
  type TimesheetDayGroup,
  type TimesheetSummary,
} from '../services/timesheet-view';

/**
 * The signed-in employee's own timesheets.
 *
 * No `employeeId` is sent: the API narrows the query to the caller's own record unless they hold
 * `timesheets.read.all`, so asking for a specific employee here would be redundant at best and
 * rejected at worst.
 */
export function useTimesheet() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'timesheets.read');
  const canWrite = hasPermission(permissions, 'timesheets.write');

  const resource = useAsyncResource<Timesheet[]>(
    () => timesheetRepository.list(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const timesheets = useMemo(() => resource.data ?? [], [resource.data]);

  /** The most recent period's sheet, which is the one the log screen works against. */
  const current = timesheets[0] ?? null;

  const addEntry = useCallback(
    (timesheetId: string, input: ManualEntryInput) =>
      run(
        () => timesheetRepository.addEntry(organizationId!, timesheetId, input),
        'The time entry could not be saved.',
      ),
    [organizationId, run],
  );

  const submit = useCallback(
    (timesheetId: string) =>
      run(
        () => timesheetRepository.submit(organizationId!, timesheetId),
        'The timesheet could not be submitted.',
      ),
    [organizationId, run],
  );

  // Presentation shapes the screens render, derived from the same timesheets.
  const summary: TimesheetSummary = useMemo(() => summarize(timesheets), [timesheets]);
  const groupedLogs: TimesheetDayGroup[] = useMemo(() => toDayGroups(current), [current]);
  const approvedTimesheet = useMemo(() => latestApproved(timesheets), [timesheets]);

  return {
    timesheets,
    current,
    summary,
    groupedLogs,
    approvedTimesheet,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    addEntry,
    submit,
    canRead,
    canWrite,
    /** True when the signed-in user has no employee record, so time cannot be logged. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type TimesheetState = ReturnType<typeof useTimesheet>;
