'use client';

import { useMemo } from 'react';
import { hasPermission, type Team } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * The signed-in employee's own team membership.
 *
 * Deliberately lighter than `useTeamDirectory`: the context bar renders on every screen and
 * only needs team names, so this fetches teams alone rather than also pulling the employee
 * directory and branch list.
 *
 * Membership is matched on the employee id from the session. The previous version compared
 * names and employee numbers against a fixture roster, which attributed a team to the wrong
 * person whenever two employees shared a name.
 */
export function useMyTeams() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'teams.read');

  const resource = useAsyncResource<Team[]>(
    () => workforceRepository.listTeams(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const myTeams = useMemo(() => {
    if (!resource.data || !employeeId) return [];
    return resource.data.filter(
      (team) =>
        team.teamLeadEmployeeId === employeeId ||
        (team.members ?? []).some((member) => member.employeeId === employeeId && !member.leftAt),
    );
  }, [resource.data, employeeId]);

  return {
    myTeams,
    primaryTeam: myTeams[0] ?? null,
    /** False while loading: the UI must not claim membership it has not confirmed. */
    isAssignedToTeam: myTeams.length > 0,
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
  };
}
