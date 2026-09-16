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

type TeamRow = Prisma.TeamGetPayload<{ include: { members: true } }>;
type ProjectRow = Prisma.ProjectGetPayload<{ include: { members: true } }>;

export function toTeamDto(team: TeamRow) {
  return {
    id: team.id,
    organizationId: team.organizationId,
    branchId: team.branchId,
    name: team.name,
    description: team.description,
    teamLeadEmployeeId: team.teamLeadEmployeeId,
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
    joinedAt: dateOnly(member.joinedAt),
    leftAt: member.leftAt ? dateOnly(member.leftAt) : null,
  };
}

export function toProjectDto(project: ProjectRow) {
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
    // A Decimal serialises as a string; keeping it one is deliberate, matching how every other
    // numeric of consequence crosses this boundary.
    allocationPercentage:
      member.allocationPercentage === null ? null : member.allocationPercentage.toString(),
    startsOn: dateOnly(member.startsOn),
    endsOn: member.endsOn ? dateOnly(member.endsOn) : null,
  };
}

/** A `@db.Date` column carries no meaningful time; sending one invites a timezone bug. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
