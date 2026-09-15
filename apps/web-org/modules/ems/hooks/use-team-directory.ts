'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Branch, type Employee, type Team } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import {
  teamsProjectsRepository,
  type CreateTeamInput,
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

/** Today in the `YYYY-MM-DD` form the API's date-only fields expect. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  const canReadEmployees = hasPermission(permissions, 'employees.read');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [teams, employees, branches] = await Promise.all([
        workforceRepository.listTeams(organizationId!),
        // Names come from the employee directory; without permission the roster still renders,
        // showing membership without the people's names rather than inventing them.
        canReadEmployees ? workforceRepository.listEmployees(organizationId!) : Promise.resolve([]),
        workforceRepository.listBranches(organizationId!).catch(() => [] as Branch[]),
      ]);
      return { teams, employees, branches };
    },
    [organizationId, canReadEmployees],
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
        const team = await teamsProjectsRepository.createTeam(organizationId!, input);
        for (const id of memberEmployeeIds) {
          await membershipRepository.addTeamMember(organizationId!, team.id, {
            employeeId: id,
            joinedAt: today(),
          });
        }
        return team;
      }, 'The team could not be created.'),
    [organizationId, run],
  );

  const addMember = useCallback(
    (teamId: string, memberEmployeeId: string) =>
      run(
        () =>
          membershipRepository.addTeamMember(organizationId!, teamId, {
            employeeId: memberEmployeeId,
            joinedAt: today(),
          }),
        'The member could not be added.',
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
    addMember,
    endMember,
    archiveTeam,
    canRead,
    canWrite,
  };
}

export type TeamDirectoryState = ReturnType<typeof useTeamDirectory>;
