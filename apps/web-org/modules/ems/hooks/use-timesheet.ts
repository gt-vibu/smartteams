'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type JobType, type Project, type Timesheet } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { timesheetRepository, type ManualEntryInput } from '../repositories/timesheet.repository';
import { workforceRepository } from '../repositories/workforce.repository';
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
 * The signed-in employee's own timesheets, projects, and reusable job types.
 */
export function useTimesheet() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'timesheets.read');
  const canWrite = hasPermission(permissions, 'timesheets.write');
  const canReadProjects = hasPermission(permissions, 'projects.read') || canRead;
  // The API holds project quick-add to the Projects module's own rule; the form hides the control
  // from anyone it would refuse.
  const canCreateProject = hasPermission(permissions, 'projects.write');

  const resource = useAsyncResource<Timesheet[]>(
    () => timesheetRepository.list(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const jobTypesResource = useAsyncResource<JobType[]>(
    () => timesheetRepository.listJobTypes(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const projectsResource = useAsyncResource<Project[]>(
    () => workforceRepository.listProjects(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadProjects },
  );

  const { saving, saveError, run } = useMutationRunner(async () => {
    await resource.refetch();
    await jobTypesResource.refetch();
  });

  const timesheets = useMemo(() => resource.data ?? [], [resource.data]);
  const jobTypes = useMemo(() => jobTypesResource.data ?? [], [jobTypesResource.data]);
  const projects = useMemo(() => projectsResource.data ?? [], [projectsResource.data]);

  /** The most recent period's sheet, which is the one the log screen works against. */
  const current = timesheets[0] ?? null;

  const addEntry = useCallback(
    (input: ManualEntryInput, timesheetId?: string) =>
      run(
        () => timesheetRepository.addEntry(organizationId!, timesheetId || current?.id, input),
        'The time entry could not be saved.',
      ),
    [organizationId, current?.id, run],
  );

  /*
   * The two quick-add actions do not go through `run`. `run` reports success as `true` and
   * failure as `false` with the message parked in `saveError` — right for a form's own save,
   * wrong for a dialog that needs the created row back and its own error to show. The Log Time
   * form was doing `'id' in created` on that boolean, which throws: a project that *had* been
   * created was reported as a TypeError and never selected. These resolve with the row and
   * reject with the server's reason, and the quick-add dialog shows either.
   */
  const createJobType = useCallback(
    async (name: string): Promise<JobType> => {
      const created = await timesheetRepository.createJobType(organizationId!, name);
      await jobTypesResource.refetch();
      return created;
    },
    [organizationId, jobTypesResource],
  );

  const quickCreateProject = useCallback(
    async (name: string, description?: string): Promise<Project> => {
      const created = await timesheetRepository.quickCreateProject(
        organizationId!,
        name,
        description,
      );
      // Refetched before resolving, so the new project is already an option when the form
      // selects it.
      await projectsResource.refetch();
      return created;
    },
    [organizationId, projectsResource],
  );

  const submit = useCallback(
    (timesheetId: string) =>
      run(
        () => timesheetRepository.submit(organizationId!, timesheetId),
        'The timesheet could not be submitted.',
      ),
    [organizationId, run],
  );

  const unsubmit = useCallback(
    (timesheetId: string) =>
      run(
        () => timesheetRepository.unsubmit(organizationId!, timesheetId),
        'The timesheet could not be recalled.',
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
    jobTypes,
    projects,
    loading: resource.loading || jobTypesResource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    refetchProjects: projectsResource.refetch,
    refetchJobTypes: jobTypesResource.refetch,
    saving,
    saveError,
    addEntry,
    createJobType,
    quickCreateProject,
    submit,
    unsubmit,
    canRead,
    canWrite,
    canCreateProject,
    /** True when the signed-in user has no employee record, so time cannot be logged. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type TimesheetState = ReturnType<typeof useTimesheet>;
