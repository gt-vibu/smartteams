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
  isLead: boolean;
};

export type ProjectMembership = {
  project: Project;
  state: MembershipState;
  memberId: string | null;
  endedOn: string | null;
  isLead: boolean;
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
    const isLead = team.teamLeadEmployeeId === employeeId;
    const active = activeTeamMember(team.members, employeeId);
    if (active) return { team, state: 'ACTIVE', memberId: active.id, endedOn: null, isLead };

    if (isLead) {
      return { team, state: 'ACTIVE', memberId: null, endedOn: null, isLead: true };
    }

    const ended = endedTeamMember(team.members, employeeId);
    if (ended)
      return { team, state: 'ENDED', memberId: null, endedOn: ended.leftAt ?? null, isLead: false };

    return { team, state: 'NOT_A_MEMBER', memberId: null, endedOn: null, isLead: false };
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
    const isLead = project.projectLeadEmployeeId === employeeId;
    const active = activeProjectMember(project.members, employeeId);
    if (active) {
      return {
        project,
        state: 'ACTIVE',
        memberId: active.id,
        endedOn: null,
        isLead,
      };
    }

    if (isLead) {
      return {
        project,
        state: 'ACTIVE',
        memberId: null,
        endedOn: null,
        isLead: true,
      };
    }

    const ended = endedProjectMember(project.members, employeeId);
    if (ended) {
      return {
        project,
        state: 'ENDED',
        memberId: null,
        endedOn: ended.endsOn ?? null,
        isLead: false,
      };
    }

    return {
      project,
      state: 'NOT_A_MEMBER',
      memberId: null,
      endedOn: null,
      isLead: false,
    };
  });
}
