'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Branch, type Employee, type Team } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import {
  teamsProjectsRepository,
  type CreateTeamInput,
  type UpdateTeamInput,
} from '../repositories/teams-projects.repository';
import { membershipRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import {
  indexEmployees,
  teamsForEmployee,
  toTeamView,
  type TeamView,
} from '../services/team-directory';
import { localDateKey } from '../lib/local-date';

/** Today in the `YYYY-MM-DD` form the API's date-only fields expect. */
function today(): string {
  return localDateKey();
}

type Loaded = { teams: Team[]; employees: Employee[]; branches: Branch[] };

/**
 * The team directory, assembled from the teams, employees and branch endpoints.
 *
 * Everything is server state: there is no local copy to edit and no fixture to fall back on.
 * Each mutation calls the API and then refetches, so what the screen shows afterwards is what
 * was actually stored.
 */
export function useTeamDirectory() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'teams.read');
  const canWrite = hasPermission(permissions, 'teams.write');
  const canReadBranches = hasPermission(permissions, 'branches.read');
  // Without this the API answers with the caller's own rows only, so there is no "all" view.
  const canReadAll = hasPermission(permissions, 'teams.read.all');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [teams, employees, branches] = await Promise.all([
        workforceRepository.listTeams(organizationId!),
        // Names come from the employee directory; without permission the roster still renders,
        // showing membership without the people's names rather than inventing them.
        Promise.resolve([] as Employee[]),
        canReadBranches
          ? workforceRepository.listBranches(organizationId!).catch(() => [] as Branch[])
          : Promise.resolve([] as Branch[]),
      ]);
      return { teams, employees, branches };
    },
    [organizationId, canReadBranches],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const views: TeamView[] = useMemo(() => {
    if (!resource.data) return [];
    const employees = indexEmployees(resource.data.employees);
    return resource.data.teams.map((team) => toTeamView(team, employees, resource.data!.branches));
  }, [resource.data]);

  const myTeams = useMemo(() => teamsForEmployee(views, employeeId), [views, employeeId]);

  const createTeam = useCallback(
    (input: CreateTeamInput, memberEmployeeIds: readonly string[]) =>
      run(async () => {
        return teamsProjectsRepository.createTeam(organizationId!, { ...input, memberEmployeeIds: [...memberEmployeeIds] });
      }, 'The team could not be created.', 'Team created.'),
    [organizationId, run],
  );

  /** Renames a team, moves it to another branch, or changes its lead. */
  const updateTeam = useCallback(
    (teamId: string, input: UpdateTeamInput) =>
      run(
        () => teamsProjectsRepository.updateTeam(organizationId!, teamId, input),
        'The team could not be saved.',
      ),
    [organizationId, run],
  );

  const addMember = useCallback(
    (teamId: string, memberEmployeeId: string, teamRole?: string) =>
      run(
        () =>
          membershipRepository.addTeamMember(organizationId!, teamId, {
            employeeId: memberEmployeeId,
            joinedAt: today(),
            ...(teamRole ? { teamRole } : {}),
          }),
        'The member could not be added.',
      ),
    [organizationId, run],
  );

  const changeRole = useCallback(
    (teamId: string, memberId: string, teamRole: string) =>
      run(
        () => membershipRepository.updateTeamMember(organizationId!, teamId, memberId, teamRole),
        'The role could not be changed.',
      ),
    [organizationId, run],
  );

  /** Ends a membership. The row is retained with a leave date; nothing is deleted. */
  const endMember = useCallback(
    (teamId: string, memberId: string) =>
      run(
        () => membershipRepository.endTeamMember(organizationId!, teamId, memberId, today()),
        'The membership could not be ended.',
      ),
    [organizationId, run],
  );

  const archiveTeam = useCallback(
    (teamId: string, reason: string) =>
      run(
        () => teamsProjectsRepository.archiveTeam(organizationId!, teamId, reason),
        'The team could not be archived.',
      ),
    [organizationId, run],
  );

  return {
    teams: views,
    myTeams,
    employees: resource.data?.employees ?? [],
    branches: resource.data?.branches ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    createTeam,
    updateTeam,
    addMember,
    changeRole,
    endMember,
    archiveTeam,
    canRead,
    canReadAll,
    canWrite,
  };
}

export type TeamDirectoryState = ReturnType<typeof useTeamDirectory>;
