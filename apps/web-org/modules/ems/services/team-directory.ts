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
 * Project members reuse the employee's current job title, so there is one source of truth for a
 * person's professional role across their profile and project assignments.
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
  /** Team responsibility for teams, or the employee's job title for project assignments. */
  role: string | null;
};

export type TeamView = {
  team: Team;
  branchName: string | null;
  lead: { employeeId: string; displayName: string; employeeNumber: string } | null;
  activeMembers: MemberView[];
  pastMembers: MemberView[];
};

export type ProjectMemberView = MemberView;

export type ProjectView = {
  project: Project;
  branchName: string | null;
  lead: { employeeId: string; displayName: string; employeeNumber: string } | null;
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
  // Someone who cannot read branches sees no branch name rather than a placeholder for one.
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
  // The directory when the viewer may read it, otherwise the summary the membership carries:
  // an employee may only read their own record, and a team list of "?" named nobody.
  const employee = employees.get(member.employeeId) ?? member.employee ?? undefined;
  const displayName = employee ? employeeDisplayName(employee) : MISSING.displayName;
  return {
    memberId: member.id,
    employeeId: member.employeeId,
    displayName,
    employeeNumber: employee?.employeeNumber ?? MISSING.employeeNumber,
    initials: employee ? initialsOf(displayName) : '?',
    since,
    until,
    role: 'teamRole' in member ? (member.teamRole ?? null) : (member.employee?.jobTitle ?? null),
  };
}

/**
 * Current until its last day has passed: an end date later than today is still current.
 *
 * Today is the viewer's own date, which is the date the server ends a membership on. Read from
 * `toISOString()` it was UTC's, so after 18:30 in Kolkata a membership ended earlier the same day
 * still counted as current: the person stayed in Members with "until <yesterday>" beside their
 * name and an End membership button that the server then refused as already ended.
 */
function current(until: string | null | undefined) {
  if (!until) return true;
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const today = `${now.getFullYear()}-${month}-${`${now.getDate()}`.padStart(2, '0')}`;
  return until.slice(0, 10) >= today;
}

export function toTeamView(
  team: Team,
  employees: Map<string, Employee>,
  branches: readonly Branch[],
): TeamView {
  const members = team.members ?? [];
  // The directory entry when this viewer may read it; otherwise the name the team carries.
  const leadEmployee = team.teamLeadEmployeeId
    ? (employees.get(team.teamLeadEmployeeId) ?? team.teamLead ?? undefined)
    : undefined;

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
      .filter((member) => current(member.leftAt))
      .map((member) => memberView(member, member.joinedAt, member.leftAt ?? null, employees)),
    pastMembers: members
      .filter((member) => !current(member.leftAt))
      .map((member) => memberView(member, member.joinedAt, member.leftAt ?? null, employees)),
  };
}

function projectMemberView(
  member: ProjectMember,
  employees: Map<string, Employee>,
): ProjectMemberView {
  return memberView(member, member.startsOn, member.endsOn ?? null, employees);
}

export function toProjectView(
  project: Project,
  employees: Map<string, Employee>,
  branches: readonly Branch[],
): ProjectView {
  const members = project.members ?? [];
  const leadId = project.projectLeadEmployeeId ?? null;
  // The directory entry when this viewer may read it; otherwise the name the project carries.
  const leadEmployee = leadId
    ? (employees.get(leadId) ?? project.projectLead ?? undefined)
    : undefined;
  return {
    project,
    branchName: branchNameOf(branches, project.branchId),
    lead: leadId
      ? {
          employeeId: leadId,
          displayName: leadEmployee ? employeeDisplayName(leadEmployee) : MISSING.displayName,
          employeeNumber: leadEmployee?.employeeNumber ?? MISSING.employeeNumber,
        }
      : null,
    activeMembers: members
      .filter((member) => current(member.endsOn))
      .map((member) => projectMemberView(member, employees)),
    pastMembers: members
      .filter((member) => !current(member.endsOn))
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
