'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { membershipRepository, workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import {
  projectMembershipsFor,
  teamMembershipsFor,
  type ProjectMembership,
  type TeamMembership,
} from '../services/membership-state';

/** Today in the `YYYY-MM-DD` form the API's date-only fields expect. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AssignmentChange =
  | { kind: 'ADD_TEAM'; teamId: string }
  | { kind: 'END_TEAM'; teamId: string; memberId: string }
  | { kind: 'ADD_PROJECT'; projectId: string; allocationPercentage: number }
  | { kind: 'END_PROJECT'; projectId: string; memberId: string };

/**
 * Team and project assignments for one employee, read from and written to the backend.
 *
 * Teams and projects are loaded with their members, so membership state is derived from server
 * data rather than tracked locally. After any mutation the lists are refetched, so what the UI
 * shows is what the server stored — there is no optimistic local copy to drift.
 */
export function useAssignments(employeeId: string | null) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadTeams = hasPermission(permissions, 'teams.read');
  const canReadProjects = hasPermission(permissions, 'projects.read');
  const canWriteTeams = hasPermission(permissions, 'teams.write');
  const canWriteProjects = hasPermission(permissions, 'projects.write');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource(
    async () => {
      const [teams, projects] = await Promise.all([
        canReadTeams ? workforceRepository.listTeams(organizationId!) : Promise.resolve([]),
        canReadProjects ? workforceRepository.listProjects(organizationId!) : Promise.resolve([]),
      ]);
      return { teams, projects };
    },
    [organizationId, canReadTeams, canReadProjects],
    { enabled: Boolean(organizationId) && (canReadTeams || canReadProjects) },
  );

  const teamMemberships: TeamMembership[] = useMemo(
    () => (resource.data && employeeId ? teamMembershipsFor(resource.data.teams, employeeId) : []),
    [resource.data, employeeId],
  );

  const projectMemberships: ProjectMembership[] = useMemo(
    () =>
      resource.data && employeeId ? projectMembershipsFor(resource.data.projects, employeeId) : [],
    [resource.data, employeeId],
  );

  /**
   * Applies changes sequentially and refetches once.
   *
   * Sequential rather than parallel so a failure part-way leaves a comprehensible state, and so
   * the error surfaced names the first thing that actually failed.
   */
  const applyChanges = useCallback(
    async (changes: readonly AssignmentChange[]) => {
      if (!organizationId || !employeeId) throw new Error('No active organization.');
      setSaving(true);
      setSaveError(null);
      try {
        for (const change of changes) {
          switch (change.kind) {
            case 'ADD_TEAM':
              await membershipRepository.addTeamMember(organizationId, change.teamId, {
                employeeId,
                joinedAt: today(),
              });
              break;
            case 'END_TEAM':
              await membershipRepository.endTeamMember(
                organizationId,
                change.teamId,
                change.memberId,
                today(),
              );
              break;
            case 'ADD_PROJECT':
              await membershipRepository.addProjectMember(organizationId, change.projectId, {
                employeeId,
                allocationPercentage: change.allocationPercentage,
                startsOn: today(),
              });
              break;
            case 'END_PROJECT':
              await membershipRepository.endProjectMember(
                organizationId,
                change.projectId,
                change.memberId,
                today(),
              );
              break;
          }
        }
        await resource.refetch();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'Could not save the assignments.');
        // Reload so the UI reflects whatever did land, rather than the attempted state.
        await resource.refetch();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, employeeId, resource],
  );

  return {
    teamMemberships,
    projectMemberships,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    applyChanges,
    canWriteTeams,
    canWriteProjects,
  };
}

/**
 * The hook's return value, so a parent can own the state and hand it to a child.
 *
 * Two components calling `useAssignments` for the same employee get two independent copies, and
 * a save through one leaves the other showing stale membership. Passing this down keeps a single
 * copy that every consumer sees refresh together.
 */
export type AssignmentsState = ReturnType<typeof useAssignments>;
