import type { Prisma } from '../../generated/prisma/client';

/**
 * Response shapes for teams and projects.
 *
 * These routes returned the Prisma rows directly, which made the database schema the API
 * contract: `createdAt`, `updatedAt` and every column added later travelled to the browser
 * whether or not anything wanted them, and a rename in the schema would have been a silent
 * breaking change for the frontend. NFR-3 rules that out — no API may expose an internal model.
 *
 * The frontend's zod schema was written by reading what the API happened to return, with a
 * comment saying so. These are the shape it should have been reading all along, and they are
 * deliberately narrow: adding a field here is a decision, where returning the row was an
 * accident.
 */

/** Every member carries a small summary of the person, so lists can name them. */
type WithEmployeeInclude = {
  members: {
    include: {
      employee: { select: { id: true; firstName: true; lastName: true; employeeNumber: true } };
    };
  };
};

type TeamRow = Prisma.TeamGetPayload<{ include: WithEmployeeInclude }>;
type ProjectRow = Prisma.ProjectGetPayload<{ include: WithEmployeeInclude }>;

type WithEmployee = {
  employee?: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
};

/** The person behind a membership row: their name and number, and nothing else about them. */
function summaryOf(member: WithEmployee) {
  return member.employee
    ? {
        id: member.employee.id,
        firstName: member.employee.firstName,
        lastName: member.employee.lastName,
        employeeNumber: member.employee.employeeNumber,
      }
    : null;
}

export function toTeamDto(
  team: TeamRow & {
    teamLead?: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
  },
) {
  return {
    id: team.id,
    organizationId: team.organizationId,
    branchId: team.branchId,
    name: team.name,
    description: team.description,
    teamLeadEmployeeId: team.teamLeadEmployeeId,
    teamLead: team.teamLead ? summaryOf({ employee: team.teamLead }) : null,
    status: team.status,
    createdAt: team.createdAt.toISOString(),
    members: team.members.map(toTeamMemberDto),
  };
}

export function toTeamMemberDto(member: TeamRow['members'][number]) {
  return {
    id: member.id,
    teamId: member.teamId,
    employeeId: member.employeeId,
    teamRole: member.teamRole,
    employee: summaryOf(member),
    joinedAt: dateOnly(member.joinedAt),
    leftAt: member.leftAt ? dateOnly(member.leftAt) : null,
  };
}

export function toProjectDto(
  project: ProjectRow & {
    projectLead?: {
      id: string;
      firstName: string;
      lastName: string;
      employeeNumber: string;
    } | null;
  },
) {
  return {
    id: project.id,
    organizationId: project.organizationId,
    branchId: project.branchId,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: project.startDate ? dateOnly(project.startDate) : null,
    endDate: project.endDate ? dateOnly(project.endDate) : null,
    projectLeadEmployeeId: project.projectLeadEmployeeId,
    projectLead: project.projectLead ? summaryOf({ employee: project.projectLead }) : null,
    createdAt: project.createdAt.toISOString(),
    members: project.members.map(toProjectMemberDto),
  };
}

export function toProjectMemberDto(member: ProjectRow['members'][number]) {
  return {
    id: member.id,
    projectId: member.projectId,
    employeeId: member.employeeId,
    projectRole: member.projectRole,
    employee: summaryOf(member),
    startsOn: dateOnly(member.startsOn),
    endsOn: member.endsOn ? dateOnly(member.endsOn) : null,
  };
}

/** A `@db.Date` column carries no meaningful time; sending one invites a timezone bug. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
