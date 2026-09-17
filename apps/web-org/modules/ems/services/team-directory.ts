import {
  employeeDisplayName,
  type Branch,
  type Employee,
  type Project,
  type ProjectMember,
  type Team,
  type TeamMember,
} from '@smarteam/contracts';

/**
 * Joins teams and projects to the employees and branches they reference.
 *
 * The membership endpoints return ids only, so names come from the employee list and branch
 * names from the branch list — both real API data. Nothing is invented for an id that has no
 * match: the row says the employee is no longer in the directory rather than guessing a name.
 *
 * Job titles are deliberately absent here. They live on employment records, one request per
 * employee, which a roster view cannot issue; the employee drawer shows them instead.
 */

export type MemberView = {
  /** The membership row id, needed to end the membership. */
  memberId: string;
  employeeId: string;
  displayName: string;
  employeeNumber: string;
  initials: string;
  since: string;
  until: string | null;
};

export type TeamView = {
  team: Team;
  branchName: string | null;
  lead: { employeeId: string; displayName: string; employeeNumber: string } | null;
  activeMembers: MemberView[];
  pastMembers: MemberView[];
};

export type ProjectMemberView = MemberView & {
  projectRole: string | null;
  allocationPercentage: number | null;
};

export type ProjectView = {
  project: Project;
  branchName: string | null;
  activeMembers: ProjectMemberView[];
  pastMembers: ProjectMemberView[];
};

export function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function indexEmployees(employees: readonly Employee[]): Map<string, Employee> {
  return new Map(employees.map((employee) => [employee.id, employee]));
}

function branchNameOf(branches: readonly Branch[], branchId: string | null | undefined) {
  if (!branchId) return null;
  return branches.find((branch) => branch.id === branchId)?.name ?? null;
}

/** An employee id with no matching record: the person left the directory, so say so. */
const MISSING = { displayName: 'No longer in the directory', employeeNumber: '--' };

function memberView(
  member: TeamMember | ProjectMember,
  since: string,
  until: string | null,
  employees: Map<string, Employee>,
): MemberView {
  const employee = employees.get(member.employeeId);
  const displayName = employee ? employeeDisplayName(employee) : MISSING.displayName;
  return {
    memberId: member.id,
    employeeId: member.employeeId,
    displayName,
    employeeNumber: employee?.employeeNumber ?? MISSING.employeeNumber,
    initials: employee ? initialsOf(displayName) : '?',
    since,
    until,
  };
}

export function toTeamView(
  team: Team,
  employees: Map<string, Employee>,
  branches: readonly Branch[],
): TeamView {
  const members = team.members ?? [];
  const leadEmployee = team.teamLeadEmployeeId ? employees.get(team.teamLeadEmployeeId) : undefined;

  return {
    team,
    branchName: branchNameOf(branches, team.branchId),
    lead: team.teamLeadEmployeeId
      ? {
          employeeId: team.teamLeadEmployeeId,
          displayName: leadEmployee ? employeeDisplayName(leadEmployee) : MISSING.displayName,
          employeeNumber: leadEmployee?.employeeNumber ?? MISSING.employeeNumber,
        }
      : null,
    activeMembers: members
      .filter((member) => !member.leftAt)
      .map((member) => memberView(member, member.joinedAt, null, employees)),
    pastMembers: members
      .filter((member) => member.leftAt)
      .map((member) => memberView(member, member.joinedAt, member.leftAt ?? null, employees)),
  };
}

function projectMemberView(
  member: ProjectMember,
  employees: Map<string, Employee>,
): ProjectMemberView {
  return {
    ...memberView(member, member.startsOn, member.endsOn ?? null, employees),
    projectRole: member.projectRole ?? null,
    allocationPercentage: member.allocationPercentage ?? null,
  };
}

export function toProjectView(
  project: Project,
  employees: Map<string, Employee>,
  branches: readonly Branch[],
): ProjectView {
  const members = project.members ?? [];
  return {
    project,
    branchName: branchNameOf(branches, project.branchId),
    activeMembers: members
      .filter((member) => !member.endsOn)
      .map((member) => projectMemberView(member, employees)),
    pastMembers: members
      .filter((member) => member.endsOn)
      .map((member) => projectMemberView(member, employees)),
  };
}

/** Teams the employee currently belongs to, or leads. Ended membership does not count. */
export function teamsForEmployee(views: readonly TeamView[], employeeId: string | null) {
  if (!employeeId) return [];
  return views.filter(
    (view) =>
      view.lead?.employeeId === employeeId ||
      view.activeMembers.some((member) => member.employeeId === employeeId),
  );
}
