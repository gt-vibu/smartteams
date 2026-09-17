import { Injectable } from '@nestjs/common';
import { ProjectStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { toProjectDto, toTeamDto } from './workforce-mappers';

@Injectable()
export class TeamsProjectsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listTeams(context: DomainContext) {
    requirePermission(context, 'teams.read');
    return this.database.run(context, async (tx) => {
      // Bounded: the previous read returned every team with every membership row attached, so a
      // large tenant produced one very large response and no way to ask for less.
      const teams = await tx.team.findMany({
        where: { organizationId: context.organizationId, status: 'ACTIVE' },
        include: { members: true },
        orderBy: { name: 'asc' },
        // One over the cap, so a truncated list can say so rather than looking complete.
        take: 201,
      });
      const page = teams.slice(0, 200);
      return { items: page.map(toTeamDto), truncated: teams.length > 200 };
    });
  }

  async listProjects(context: DomainContext) {
    requirePermission(context, 'projects.read');
    return this.database.run(context, async (tx) => {
      const projects = await tx.project.findMany({
        where: { organizationId: context.organizationId },
        include: { members: true },
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
    input: { name?: string; description?: string; branchId?: string; teamLeadEmployeeId?: string },
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
          teamLeadEmployeeId: input.teamLeadEmployeeId,
        },
      });
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
      code: string;
      name: string;
      description?: string;
      branchId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    requirePermission(context, 'projects.write');
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
      const project = await tx.project.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description,
          branchId: input.branchId,
          startDate: input.startDate ? dateOnly(input.startDate) : undefined,
          endDate: input.endDate ? dateOnly(input.endDate) : undefined,
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
      const updated = await tx.project.update({
        where: { id: before.id },
        data: {
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
