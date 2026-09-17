import type { Project, ProjectMember, Team, TeamMember } from '@smarteam/contracts';

/**
 * Membership has three states, and conflating them loses information the user needs:
 *
 *  - ACTIVE      — a member row with no end date.
 *  - ENDED       — a member row that has been closed. The person *was* on the team.
 *  - NOT_A_MEMBER — no row at all.
 *
 * An ended membership is not the same as never having been a member, so the UI must be able to
 * tell them apart rather than treating both as "unchecked".
 */
export type MembershipState = 'ACTIVE' | 'ENDED' | 'NOT_A_MEMBER';

export type TeamMembership = {
  team: Team;
  state: MembershipState;
  /** The active member row's id, needed to end it. Null unless state is ACTIVE. */
  memberId: string | null;
  endedOn: string | null;
};

export type ProjectMembership = {
  project: Project;
  state: MembershipState;
  memberId: string | null;
  allocationPercentage: number | null;
  endedOn: string | null;
};

function activeTeamMember(members: TeamMember[] | undefined, employeeId: string) {
  return members?.find((member) => member.employeeId === employeeId && !member.leftAt) ?? null;
}

function endedTeamMember(members: TeamMember[] | undefined, employeeId: string) {
  // Most recently closed first, so the UI reports the latest departure.
  return (
    members
      ?.filter((member) => member.employeeId === employeeId && member.leftAt)
      .sort((a, b) => (b.leftAt ?? '').localeCompare(a.leftAt ?? ''))[0] ?? null
  );
}

export function teamMembershipsFor(teams: Team[], employeeId: string): TeamMembership[] {
  return teams.map((team) => {
    const active = activeTeamMember(team.members, employeeId);
    if (active) return { team, state: 'ACTIVE', memberId: active.id, endedOn: null };

    const ended = endedTeamMember(team.members, employeeId);
    if (ended) return { team, state: 'ENDED', memberId: null, endedOn: ended.leftAt ?? null };

    return { team, state: 'NOT_A_MEMBER', memberId: null, endedOn: null };
  });
}

function activeProjectMember(members: ProjectMember[] | undefined, employeeId: string) {
  return members?.find((member) => member.employeeId === employeeId && !member.endsOn) ?? null;
}

function endedProjectMember(members: ProjectMember[] | undefined, employeeId: string) {
  return (
    members
      ?.filter((member) => member.employeeId === employeeId && member.endsOn)
      .sort((a, b) => (b.endsOn ?? '').localeCompare(a.endsOn ?? ''))[0] ?? null
  );
}

export function projectMembershipsFor(
  projects: Project[],
  employeeId: string,
): ProjectMembership[] {
  return projects.map((project) => {
    const active = activeProjectMember(project.members, employeeId);
    if (active) {
      return {
        project,
        state: 'ACTIVE',
        memberId: active.id,
        allocationPercentage: active.allocationPercentage ?? null,
        endedOn: null,
      };
    }

    const ended = endedProjectMember(project.members, employeeId);
    if (ended) {
      return {
        project,
        state: 'ENDED',
        memberId: null,
        allocationPercentage: null,
        endedOn: ended.endsOn ?? null,
      };
    }

    return {
      project,
      state: 'NOT_A_MEMBER',
      memberId: null,
      allocationPercentage: null,
      endedOn: null,
    };
  });
}

/** Total allocation across active project assignments; the API caps each at 100. */
export function totalActiveAllocation(memberships: readonly ProjectMembership[]): number {
  return memberships
    .filter((membership) => membership.state === 'ACTIVE')
    .reduce((sum, membership) => sum + (membership.allocationPercentage ?? 0), 0);
}
