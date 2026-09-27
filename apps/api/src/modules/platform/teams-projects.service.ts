import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { ProjectStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { toProjectDto, toTeamDto } from './workforce-mappers';
import { assertProjectLead } from './project-lead';
import { endLeadMembership } from './team-lead';

@Injectable()
export class TeamsProjectsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Teams the caller may see. Someone who manages teams sees them all; everyone else sees only
   * the teams they are on or lead — as projects already worked. Employees used to receive every
   * team in the company, with every member of it.
   */
  async listTeams(context: DomainContext) {
    requirePermission(context, 'teams.read');
    const seesAll =
      context.permissions.has('*') ||
      context.permissions.has('teams.write') ||
      context.accessMode === 'FEDERATION';
    return this.database.run(context, async (tx) => {
      const self = seesAll
        ? null
        : await tx.employee.findFirst({
            where: { organizationId: context.organizationId, userId: context.actor.userId },
            select: { id: true },
          });
      if (!seesAll && !self) return { items: [], truncated: false };
      // Bounded: the previous read returned every team with every membership row attached, so a
      // large tenant produced one very large response and no way to ask for less.
      const teams = await tx.team.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          ...(self
            ? {
                OR: [
                  { members: { some: { employeeId: self.id } } },
                  { teamLeadEmployeeId: self.id },
                ],
              }
            : {}),
        },
        include: {
          // The lead's name, for the same reason as the members' below.
          teamLead: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
          members: {
            // The colleague's name, so a member list reads as people rather than ids. An employee
            // may only read their own employee record, so the name cannot come from there.
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, employeeNumber: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        // One over the cap, so a truncated list can say so rather than looking complete.
        take: 201,
      });
      const page = teams.slice(0, 200);
      return { items: page.map(toTeamDto), truncated: teams.length > 200 };
    });
  }

  /**
   * Projects the caller may see. Someone who manages projects sees them all; everyone else sees
   * only the projects they are, or were, a member of. Employees used to see every project in the
   * company, including ones they had nothing to do with.
   */
  async listProjects(context: DomainContext) {
    requirePermission(context, 'projects.read');
    const seesAll =
      context.permissions.has('*') ||
      context.permissions.has('projects.write') ||
      context.accessMode === 'FEDERATION';
    return this.database.run(context, async (tx) => {
      const self = seesAll
        ? null
        : await tx.employee.findFirst({
            where: { organizationId: context.organizationId, userId: context.actor.userId ?? '' },
            select: { id: true },
          });
      if (!seesAll && !self) return { items: [], truncated: false };
      const projects = await tx.project.findMany({
        where: {
          organizationId: context.organizationId,
          // Their projects are the ones they work on or lead.
          ...(self
            ? {
                OR: [
                  { members: { some: { employeeId: self.id } } },
                  { projectLeadEmployeeId: self.id },
                ],
              }
            : {}),
        },
        include: {
          // The lead's name, for the same reason as the members' below.
          projectLead: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
          members: {
            // The colleague's name, so a member list reads as people rather than ids. An employee
            // may only read their own employee record, so the name cannot come from there.
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, employeeNumber: true },
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { code: 'asc' }],
        take: 201,
      });
      const page = projects.slice(0, 200);
      return { items: page.map(toProjectDto), truncated: projects.length > 200 };
    });
  }

  async createTeam(
    context: DomainContext,
    input: { name: string; description?: string; branchId?: string; teamLeadEmployeeId?: string },
  ) {
    requirePermission(context, 'teams.write');
    // A team belongs somewhere. Partners send what their own systems hold, so the requirement is
    // the app's alone: making it universal would refuse federated payloads that were accepted
    // yesterday.
    if (context.accessMode === 'NATIVE' && !input.branchId)
      throw new ConflictError('Choose the branch this team belongs to');
    return this.database.run(context, async (tx) => {
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      if (
        input.teamLeadEmployeeId &&
        !(await tx.employee.findFirst({
          where: {
            id: input.teamLeadEmployeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
          },
        }))
      )
        throw new NotFoundError('Team lead employee');
      const team = await tx.team.create({
        data: {
          organizationId: context.organizationId,
          name: input.name.trim(),
          description: input.description,
          branchId: input.branchId,
          teamLeadEmployeeId: input.teamLeadEmployeeId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TEAM',
          entityId: team.id,
          action: 'TEAM_CREATED',
          afterState: jsonSnapshot(team),
        },
        tx,
      );
      return team;
    });
  }

  async updateTeam(
    context: DomainContext,
    teamId: string,
    input: {
      name?: string;
      description?: string;
      branchId?: string;
      teamLeadEmployeeId?: string | null;
    },
  ) {
    requirePermission(context, 'teams.write');
    return this.database.run(context, async (tx) => {
      const before = await tx.team.findFirst({
        where: { id: teamId, organizationId: context.organizationId, status: 'ACTIVE' },
      });
      if (!before) throw new NotFoundError('Team');
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      if (
        input.teamLeadEmployeeId &&
        !(await tx.employee.findFirst({
          where: {
            id: input.teamLeadEmployeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
          },
        }))
      )
        throw new NotFoundError('Team lead employee');
      const updated = await tx.team.update({
        where: { id: before.id },
        data: {
          name: input.name?.trim(),
          description: input.description,
          branchId: input.branchId,
          ...(input.teamLeadEmployeeId !== undefined
            ? { teamLeadEmployeeId: input.teamLeadEmployeeId }
            : {}),
        },
      });
      // The lead leads the team; they are not also one of its members. A member made lead leaves
      // the member list today, with their membership history kept.
      if (input.teamLeadEmployeeId && input.teamLeadEmployeeId !== before.teamLeadEmployeeId)
        await endLeadMembership(tx, context, this.audit, before.id, input.teamLeadEmployeeId);
      await this.audit.record(
        context,
        {
          entityType: 'TEAM',
          entityId: updated.id,
          action: 'TEAM_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async archiveTeam(context: DomainContext, teamId: string, reason: string) {
    requirePermission(context, 'teams.write');
    if (!reason.trim()) throw new ConflictError('Team archival requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.team.findFirst({
        where: { id: teamId, organizationId: context.organizationId, status: 'ACTIVE' },
      });
      if (!before) throw new NotFoundError('Team');
      const updated = await tx.team.update({
        where: { id: before.id },
        data: { status: 'ARCHIVED' },
      });
      await this.audit.record(
        { ...context, reason },
        {
          entityType: 'TEAM',
          entityId: updated.id,
          action: 'TEAM_ARCHIVED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return updated;
    });
  }

  async createProject(
    context: DomainContext,
    input: {
      /** Optional: PRJ-001, PRJ-002 … is generated when left out. */
      code?: string;
      name: string;
      description?: string;
      branchId?: string;
      startDate?: string;
      endDate?: string;
      /** Optional: a project may be created before anyone leads it. */
      projectLeadEmployeeId?: string;
    },
  ) {
    requirePermission(context, 'projects.write');
    if (!input.name.trim()) throw new ConflictError('Give the project a name');
    // As for teams: the app requires a branch, federation keeps its existing contract.
    if (context.accessMode === 'NATIVE' && !input.branchId)
      throw new ConflictError('Choose the branch this project belongs to');
    if (input.startDate && input.endDate && input.endDate < input.startDate)
      throw new ConflictError('Project end date must not precede start date');
    return this.database.run(context, async (tx) => {
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      if (input.projectLeadEmployeeId)
        await assertProjectLead(tx, context.organizationId, input.projectLeadEmployeeId);
      const code =
        input.code?.trim().toUpperCase() || (await nextProjectCode(tx, context.organizationId));
      const clash = await tx.project.findFirst({
        where: { organizationId: context.organizationId, code },
        select: { name: true },
      });
      if (clash) throw new ConflictError(`Project code ${code} is already used by ${clash.name}`);
      const project = await tx.project.create({
        data: {
          organizationId: context.organizationId,
          code,
          name: input.name.trim(),
          description: input.description,
          branchId: input.branchId,
          startDate: input.startDate ? dateOnly(input.startDate) : undefined,
          endDate: input.endDate ? dateOnly(input.endDate) : undefined,
          projectLeadEmployeeId: input.projectLeadEmployeeId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PROJECT',
          entityId: project.id,
          action: 'PROJECT_CREATED',
          afterState: jsonSnapshot(project),
        },
        tx,
      );
      return project;
    });
  }

  async updateProject(
    context: DomainContext,
    projectId: string,
    input: {
      code?: string;
      name?: string;
      description?: string;
      branchId?: string;
      startDate?: string;
      endDate?: string;
      status?: ProjectStatus;
      /** A new lead, or `null` to leave the project without one. Absent leaves it unchanged. */
      projectLeadEmployeeId?: string | null;
    },
  ) {
    requirePermission(context, 'projects.write');
    return this.database.run(context, async (tx) => {
      const before = await tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Project');
      const startDate = input.startDate ? dateOnly(input.startDate) : before.startDate;
      const endDate = input.endDate ? dateOnly(input.endDate) : before.endDate;
      if (startDate && endDate && endDate < startDate)
        throw new ConflictError('Project end date must not precede start date');
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      if (input.projectLeadEmployeeId)
        await assertProjectLead(tx, context.organizationId, input.projectLeadEmployeeId);
      const updated = await tx.project.update({
        where: { id: before.id },
        data: {
          ...(input.projectLeadEmployeeId !== undefined
            ? { projectLeadEmployeeId: input.projectLeadEmployeeId }
            : {}),
          code: input.code?.trim().toUpperCase(),
          name: input.name?.trim(),
          description: input.description,
          branchId: input.branchId,
          startDate: input.startDate ? startDate : undefined,
          endDate: input.endDate ? endDate : undefined,
          status: input.status,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PROJECT',
          entityId: updated.id,
          action: 'PROJECT_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async archiveProject(context: DomainContext, projectId: string, reason: string) {
    requirePermission(context, 'projects.write');
    if (!reason.trim()) throw new ConflictError('Project archival requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Project');
      if (before.status === ProjectStatus.ARCHIVED)
        throw new ConflictError('Project is already archived');
      const updated = await tx.project.update({
        where: { id: before.id },
        data: { status: ProjectStatus.ARCHIVED },
      });
      await this.audit.record(
        { ...context, reason },
        {
          entityType: 'PROJECT',
          entityId: updated.id,
          action: 'PROJECT_ARCHIVED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return updated;
    });
  }
}

function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}

/**
 * The next generated project code. The organization's settings row is locked for the transaction,
 * so two projects created at once cannot be given the same code.
 */
async function nextProjectCode(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRaw<Array<{ highest: number | null }>>`
    SELECT max(substring(code FROM ${'^PRJ-([0-9]+)$'})::int) AS highest
    FROM projects WHERE organization_id = ${organizationId}::uuid AND code ~ ${'^PRJ-[0-9]+$'}`;
  return `PRJ-${String((rows[0]?.highest ?? 0) + 1).padStart(3, '0')}`;
}
