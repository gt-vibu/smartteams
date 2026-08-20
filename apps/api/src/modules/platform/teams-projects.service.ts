import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ProjectStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

@Injectable()
export class TeamsProjectsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listTeams(context: DomainContext) {
    requirePermission(context, 'teams.read');
    return this.database.run(context, (tx) =>
      tx.team.findMany({
        where: { organizationId: context.organizationId, status: 'ACTIVE' },
        include: { members: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async listProjects(context: DomainContext) {
    requirePermission(context, 'projects.read');
    return this.database.run(context, (tx) =>
      tx.project.findMany({
        where: { organizationId: context.organizationId },
        include: { members: true },
        orderBy: [{ status: 'asc' }, { code: 'asc' }],
      }),
    );
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

  async addTeamMember(
    context: DomainContext,
    teamId: string,
    input: { employeeId: string; joinedAt: string },
  ) {
    requirePermission(context, 'teams.write');
    return this.database.run(context, async (tx) => {
      const [team, employee] = await Promise.all([
        tx.team.findFirst({ where: { id: teamId, organizationId: context.organizationId } }),
        tx.employee.findFirst({
          where: { id: input.employeeId, organizationId: context.organizationId },
        }),
      ]);
      if (!team) throw new NotFoundError('Team');
      if (!employee) throw new NotFoundError('Employee');
      const member = await tx.teamMember.create({
        data: {
          organizationId: context.organizationId,
          teamId,
          employeeId: input.employeeId,
          joinedAt: dateOnly(input.joinedAt),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TEAM_MEMBER',
          entityId: member.id,
          action: 'TEAM_MEMBER_ADDED',
          afterState: jsonSnapshot(member),
        },
        tx,
      );
      return member;
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

  async addProjectMember(
    context: DomainContext,
    projectId: string,
    input: {
      employeeId: string;
      projectRole?: string;
      allocationPercentage?: number;
      startsOn: string;
      endsOn?: string;
    },
  ) {
    requirePermission(context, 'projects.write');
    return this.database.run(context, async (tx) => {
      const [project, employee] = await Promise.all([
        tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId } }),
        tx.employee.findFirst({
          where: { id: input.employeeId, organizationId: context.organizationId },
        }),
      ]);
      if (!project) throw new NotFoundError('Project');
      if (!employee) throw new NotFoundError('Employee');
      if (
        input.allocationPercentage !== undefined &&
        (input.allocationPercentage < 0 || input.allocationPercentage > 100)
      )
        throw new ConflictError('Allocation percentage must be between 0 and 100');
      const start = dateOnly(input.startsOn);
      const end = input.endsOn ? dateOnly(input.endsOn) : undefined;
      if (end && end < start)
        throw new ConflictError('Project assignment end must not precede start');
      const overlap = await tx.projectMember.findFirst({
        where: {
          organizationId: context.organizationId,
          projectId,
          employeeId: input.employeeId,
          startsOn: { lte: end ?? new Date('9999-12-31') },
          OR: [{ endsOn: null }, { endsOn: { gte: start } }],
        },
      });
      if (overlap) throw new ConflictError('Project assignments must not overlap');
      const member = await tx.projectMember.create({
        data: {
          organizationId: context.organizationId,
          projectId,
          employeeId: input.employeeId,
          projectRole: input.projectRole,
          allocationPercentage:
            input.allocationPercentage === undefined
              ? undefined
              : new Prisma.Decimal(input.allocationPercentage),
          startsOn: start,
          endsOn: end,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PROJECT_MEMBER',
          entityId: member.id,
          action: 'PROJECT_MEMBER_ADDED',
          afterState: jsonSnapshot(member),
        },
        tx,
      );
      return member;
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
