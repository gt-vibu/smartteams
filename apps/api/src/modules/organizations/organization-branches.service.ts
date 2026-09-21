import { Injectable } from '@nestjs/common';
import { assertBranchCanClose, organizationToday } from '../employees/employee-branch-rules';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { branchDto, runScoped } from './organization-shared';

/**
 * Branches: the places a tenant operates from.
 *
 * Separate from the organization itself because a branch is the unit almost every other module
 * scopes by — attendance, leave and payroll all narrow to one — while the organization record is
 * touched only when the tenant's own details change.
 */
@Injectable()
export class OrganizationBranchesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listBranches(context: DomainContext) {
    requirePermission(context, 'branches.read');
    return this.database.run(context, (tx) =>
      tx.branch
        .findMany({
          where: { organizationId: context.organizationId },
          orderBy: { code: 'asc' },
        })
        .then((branches) => branches.map((branch) => branchDto(branch))),
    );
  }

  async getBranch(context: DomainContext, branchId: string) {
    requirePermission(context, 'branches.read');
    return this.database.run(context, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId: context.organizationId },
      });
      if (!branch) throw new NotFoundError('Branch');
      return branchDto(branch);
    });
  }

  async createBranch(
    context: DomainContext,
    input: {
      name: string;
      code: string;
      externalId?: string;
      address?: Record<string, unknown>;
      timezone?: string;
    },
  ) {
    requirePermission(context, 'branches.write');
    const timezone = checkedTimezone(input.timezone);
    return runScoped(this.database, context, async (tx) => {
      const branch = await tx.branch.create({
        data: {
          organizationId: context.organizationId,
          name: input.name.trim(),
          code: input.code.trim().toUpperCase(),
          ...(timezone !== undefined ? { timezone } : {}),
          externalId: input.externalId,
          source: 'NATIVE',
          address: input.address === undefined ? undefined : jsonSnapshot(input.address),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: 'BRANCH_CREATED',
          afterState: jsonSnapshot(branch),
        },
        tx,
      );
      return branchDto(branch);
    });
  }

  /**
   * One branch as its settings page needs it: the branch, its work locations (the places a
   * geofenced check-in must come from) and how many current employees are based there.
   */
  async branchOverview(context: DomainContext, branchId: string) {
    requirePermission(context, 'branches.read');
    return this.database.run(context, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId: context.organizationId },
      });
      if (!branch) throw new NotFoundError('Branch');
      const [workLocations, employees] = await Promise.all([
        tx.workLocation.findMany({
          where: { organizationId: context.organizationId, branchId, isActive: true },
          orderBy: { name: 'asc' },
        }),
        tx.employee.count({
          where: {
            organizationId: context.organizationId,
            primaryBranchId: branchId,
            status: 'ACTIVE',
          },
        }),
      ]);
      return {
        ...branchDto(branch),
        geofenceMode: branch.geofenceMode,
        biometricVerificationMode: branch.biometricVerificationMode,
        employeeCount: employees,
        workLocations: workLocations.map((location) => ({
          id: location.id,
          name: location.name,
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          radiusMeters: Number(location.radiusMeters),
        })),
      };
    });
  }

  async updateBranch(
    context: DomainContext,
    branchId: string,
    input: {
      name?: string;
      code?: string;
      address?: Record<string, unknown>;
      timezone?: string;
    },
  ) {
    requirePermission(context, 'branches.write');
    const timezone = checkedTimezone(input.timezone);
    return this.database.run(context, async (tx) => {
      const before = await tx.branch.findFirst({
        where: { id: branchId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Branch');
      const updated = await tx.branch.update({
        where: { id: before.id },
        data: {
          name: input.name?.trim(),
          code: input.code?.trim().toUpperCase(),
          address: input.address === undefined ? undefined : jsonSnapshot(input.address),
          ...(timezone !== undefined ? { timezone } : {}),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'BRANCH',
          entityId: updated.id,
          action: 'BRANCH_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Branch',
          aggregateId: updated.id,
          aggregateVersion: 1,
          eventType: 'branch.updated',
          payload: jsonSnapshot(updated),
        },
        tx,
      );
      return branchDto(updated);
    });
  }

  async deactivateBranch(context: DomainContext, branchId: string, reason: string) {
    requirePermission(context, 'branches.write');
    requireReason({ ...context, reason }, 'Branch deactivation requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.branch.findFirst({
        where: { id: branchId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Branch');
      if (before.status === 'DEACTIVATED') throw new ConflictError('Branch is already deactivated');
      const today = await organizationToday(tx, context.organizationId);
      if (context.accessMode === 'NATIVE')
        await assertBranchCanClose(tx, context.organizationId, before, today);
      const updated = await tx.branch.update({
        where: { id: before.id },
        data: { status: 'DEACTIVATED' },
      });
      // Memberships that have begun end today. Nothing upcoming is left to end: in the app that
      // was refused above, and a membership may not end before it starts. Federation keeps the
      // behaviour its partners were built against.
      if (context.accessMode === 'NATIVE')
        await tx.employeeBranchAssignment.updateMany({
          where: {
            organizationId: context.organizationId,
            branchId: before.id,
            startsOn: { lte: today },
            OR: [{ endsOn: null }, { endsOn: { gt: today } }],
          },
          data: { endsOn: today },
        });
      else
        await tx.employeeBranchAssignment.updateMany({
          where: { organizationId: context.organizationId, branchId: before.id, endsOn: null },
          data: { endsOn: new Date() },
        });
      await this.audit.record(
        context,
        {
          entityType: 'BRANCH',
          entityId: updated.id,
          action: 'BRANCH_DEACTIVATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Branch',
          aggregateId: updated.id,
          aggregateVersion: 1,
          eventType: 'branch.deactivated',
          payload: jsonSnapshot(updated),
        },
        tx,
      );
      return branchDto(updated);
    });
  }
}

/** A real IANA timezone, null to clear it, or undefined when not being changed. */
function checkedTimezone(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const zone = value.trim();
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new ConflictError(`${zone} is not a timezone. Use a name like Asia/Kolkata.`);
  }
  return zone;
}
