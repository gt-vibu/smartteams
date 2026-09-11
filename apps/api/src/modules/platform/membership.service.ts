import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly } from '../employees/employee-mappers';

/**
 * Team and project membership lifecycle.
 *
 * Extracted from `TeamsProjectsService`, which owns the teams and projects themselves. Keeping
 * membership here gives the add and end-date operations one home and keeps both files within
 * the size guideline.
 *
 * Ending a membership is a soft close: `TeamMember.leftAt` / `ProjectMember.endsOn` are set
 * rather than the row being deleted, so historical allocation and reporting stay intact.
 */
/**
 * Postgres enforces non-overlapping team membership with the `team_members_no_overlap` exclusion
 * constraint. Prisma surfaces that as a driver error, so without this a legitimate domain
 * conflict — re-joining a team on or before the day the previous membership ended — would be
 * answered with a 500 instead of a 409 the caller can act on.
 */
function rethrowMembershipOverlap(caught: unknown): never {
  // The constraint name reaches us in the message for a raw driver error and in `meta` for a
  // known Prisma error, so both are searched rather than assuming one shape.
  const parts = [caught instanceof Error ? caught.message : String(caught)];
  if (caught && typeof caught === 'object' && 'meta' in caught) {
    parts.push(JSON.stringify(caught.meta));
  }
  const text = parts.join(' ');
  if (text.includes('no_overlap') || text.includes('23P01')) {
    throw new ConflictError(
      'The employee already has a team membership covering that date. Rejoining must start after the previous membership ended.',
    );
  }
  throw caught;
}

@Injectable()
export class MembershipService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

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
      const member = await tx.teamMember
        .create({
          data: {
            organizationId: context.organizationId,
            teamId,
            employeeId: input.employeeId,
            joinedAt: dateOnly(input.joinedAt),
          },
        })
        .catch(rethrowMembershipOverlap);
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

  /**
   * Closes an active team membership. Idempotency is deliberate: a membership that is already
   * closed is a conflict rather than a silent success, so the caller cannot believe it changed
   * something it did not.
   */
  async endTeamMembership(
    context: DomainContext,
    teamId: string,
    memberId: string,
    input: { leftAt: string },
  ) {
    requirePermission(context, 'teams.write');
    return this.database.run(context, async (tx) => {
      const member = await tx.teamMember.findFirst({
        // Scoped by organization AND team, so a member id from another tenant cannot be closed.
        where: { id: memberId, teamId, organizationId: context.organizationId },
      });
      if (!member) throw new NotFoundError('Team member');
      if (member.leftAt) throw new ConflictError('Team membership has already ended');

      const leftAt = dateOnly(input.leftAt);
      if (leftAt < member.joinedAt)
        throw new ConflictError('Team membership end must not precede the join date');

      const updated = await tx.teamMember.update({ where: { id: member.id }, data: { leftAt } });
      await this.audit.record(
        context,
        {
          entityType: 'TEAM_MEMBER',
          entityId: member.id,
          action: 'TEAM_MEMBER_ENDED',
          beforeState: jsonSnapshot(member),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
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

  /** Closes an active project allocation by setting `endsOn`. */
  /**
   * Changes an existing assignment's allocation or project role.
   *
   * Only the two mutable fields: the employee, the project and the start date identify the
   * assignment, and moving those silently would rewrite history that timesheets and reporting
   * already read. End the assignment and add another instead.
   */
  async updateProjectMember(
    context: DomainContext,
    projectId: string,
    memberId: string,
    input: { projectRole?: string; allocationPercentage?: number },
  ) {
    requirePermission(context, 'projects.write');
    if (
      input.allocationPercentage !== undefined &&
      (input.allocationPercentage < 0 || input.allocationPercentage > 100)
    )
      throw new ConflictError('Allocation percentage must be between 0 and 100');
    return this.database.run(context, async (tx) => {
      const before = await tx.projectMember.findFirst({
        where: { id: memberId, projectId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Project assignment');
      if (before.endsOn && before.endsOn < new Date())
        throw new ConflictError('An ended project assignment cannot be changed');
      const member = await tx.projectMember.update({
        where: { id: before.id },
        data: {
          ...(input.projectRole !== undefined ? { projectRole: input.projectRole.trim() } : {}),
          ...(input.allocationPercentage !== undefined
            ? { allocationPercentage: new Prisma.Decimal(input.allocationPercentage) }
            : {}),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PROJECT_MEMBER',
          entityId: member.id,
          action: 'PROJECT_MEMBER_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(member),
        },
        tx,
      );
      return member;
    });
  }

  async endProjectMembership(
    context: DomainContext,
    projectId: string,
    memberId: string,
    input: { endsOn: string },
  ) {
    requirePermission(context, 'projects.write');
    return this.database.run(context, async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId, organizationId: context.organizationId },
      });
      if (!member) throw new NotFoundError('Project member');
      if (member.endsOn) throw new ConflictError('Project assignment has already ended');

      const endsOn = dateOnly(input.endsOn);
      if (endsOn < member.startsOn)
        throw new ConflictError('Project assignment end must not precede start');

      const updated = await tx.projectMember.update({ where: { id: member.id }, data: { endsOn } });
      await this.audit.record(
        context,
        {
          entityType: 'PROJECT_MEMBER',
          entityId: member.id,
          action: 'PROJECT_MEMBER_ENDED',
          beforeState: jsonSnapshot(member),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }
}
