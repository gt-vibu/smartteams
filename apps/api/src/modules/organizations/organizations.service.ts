import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError, StaleWriteError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import type { AuditContext } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createPlatform(
    userId: string,
    input: {
      name: string;
      slug: string;
      timezone: string;
      currencyCode: string;
      source?: 'NATIVE' | 'BLIZBOOKS';
      externalId?: string;
      reason: string;
    },
  ) {
    const source = input.source ?? 'NATIVE';
    if ((source === 'BLIZBOOKS') !== Boolean(input.externalId?.trim()))
      throw new ConflictError(
        'A BLIZBOOKS organization requires an externalId and a NATIVE organization must not have one',
      );
    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      reason: input.reason,
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };
    const organization = await this.database.runPlatform(context, async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          source,
          externalId: input.externalId?.trim(),
          timezone: input.timezone,
          currencyCode: input.currencyCode.toUpperCase(),
          settings: { create: {} },
        },
      });
      await this.audit.record(
        { ...context, organizationId: created.id },
        {
          entityType: 'ORGANIZATION',
          entityId: created.id,
          action: 'ORGANIZATION_CREATED',
          afterState: jsonSnapshot(created),
          reason: input.reason,
        },
        tx,
      );
      return created;
    });
    return this.toDto(organization);
  }

  async get(context: DomainContext) {
    requirePermission(context, 'organizations.read');
    return this.runScoped(context, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: context.organizationId },
        include: { settings: true },
      });
      if (!organization) throw new NotFoundError('Organization');
      return this.toDto(organization);
    });
  }

  async listBranches(context: DomainContext) {
    requirePermission(context, 'branches.read');
    return this.database.run(context, (tx) =>
      tx.branch
        .findMany({
          where: { organizationId: context.organizationId },
          orderBy: { code: 'asc' },
        })
        .then((branches) => branches.map((branch) => this.branchDto(branch))),
    );
  }

  async getBranch(context: DomainContext, branchId: string) {
    requirePermission(context, 'branches.read');
    return this.database.run(context, async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId: context.organizationId },
      });
      if (!branch) throw new NotFoundError('Branch');
      return this.branchDto(branch);
    });
  }

  async createBranch(
    context: DomainContext,
    input: { name: string; code: string; externalId?: string; address?: Record<string, unknown> },
  ) {
    requirePermission(context, 'branches.write');
    return this.runScoped(context, async (tx) => {
      const branch = await tx.branch.create({
        data: {
          organizationId: context.organizationId,
          name: input.name.trim(),
          code: input.code.trim().toUpperCase(),
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
      return this.branchDto(branch);
    });
  }

  async updateBranch(
    context: DomainContext,
    branchId: string,
    input: { name?: string; code?: string; address?: Record<string, unknown> },
  ) {
    requirePermission(context, 'branches.write');
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
      return this.branchDto(updated);
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
      const updated = await tx.branch.update({
        where: { id: before.id },
        data: { status: 'DEACTIVATED' },
      });
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
      return this.branchDto(updated);
    });
  }

  async update(
    context: DomainContext,
    version: number,
    input: { name?: string; timezone?: string; currencyCode?: string },
  ) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      const before = await tx.organization.findUnique({ where: { id: context.organizationId } });
      if (!before) throw new NotFoundError('Organization');
      const updated = await tx.organization.updateMany({
        where: { id: context.organizationId, version },
        data: {
          ...input,
          currencyCode: input.currencyCode?.toUpperCase(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleWriteError();
      const after = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION',
          entityId: after.id,
          action: 'ORGANIZATION_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Organization',
          aggregateId: after.id,
          aggregateVersion: after.version,
          eventType: 'organization.updated',
          payload: jsonSnapshot(this.toDto(after)),
        },
        tx,
      );
      return this.toDto(after);
    });
  }

  async syncFederated(
    context: DomainContext,
    externalId: string,
    input: {
      name: string;
      timezone: string;
      currencyCode: string;
      status?: 'ACTIVE' | 'SUSPENDED';
    },
  ) {
    requirePermission(context, 'tenants.write');
    return this.database.runProvisioning(context, async (tx) => {
      const existing = await tx.organization.findFirst({
        where: { source: 'BLIZBOOKS', externalId },
      });
      const organization = existing
        ? await tx.organization.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              timezone: input.timezone,
              currencyCode: input.currencyCode.toUpperCase(),
              status: input.status ?? 'ACTIVE',
              version: { increment: 1 },
            },
          })
        : await tx.organization.create({
            data: {
              name: input.name,
              slug: `federated-${randomUUID()}`,
              source: 'BLIZBOOKS',
              externalId,
              timezone: input.timezone,
              currencyCode: input.currencyCode.toUpperCase(),
              status: input.status ?? 'ACTIVE',
              settings: { create: {} },
            },
          });
      const tenantContext = { ...context, organizationId: organization.id };
      await this.audit.record(
        tenantContext,
        {
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: existing ? 'ORGANIZATION_SYNCED' : 'ORGANIZATION_PROVISIONED',
          beforeState: existing ? jsonSnapshot(existing) : undefined,
          afterState: jsonSnapshot(organization),
        },
        tx,
      );
      await this.outbox.append(
        tenantContext,
        {
          aggregateType: 'Organization',
          aggregateId: organization.id,
          aggregateVersion: organization.version,
          eventType: 'organization.changed',
          payload: jsonSnapshot(this.toDto(organization)),
        },
        tx,
      );
      return this.toDto(organization);
    });
  }

  async syncFederatedBranch(
    context: DomainContext,
    organizationExternalId: string,
    externalId: string,
    input: {
      name: string;
      code?: string;
      status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
      address?: Record<string, unknown>;
    },
  ) {
    requirePermission(context, 'branches.write');
    return this.database.runProvisioning(context, async (tx) => {
      const organization = await tx.organization.findFirst({
        where: { source: 'BLIZBOOKS', externalId: organizationExternalId },
      });
      if (!organization) throw new NotFoundError('Federated organization');
      const existing = await tx.branch.findFirst({
        where: { organizationId: organization.id, externalId },
      });
      const branch = existing
        ? await tx.branch.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              code: input.code ?? existing.code,
              status: input.status ?? 'ACTIVE',
              address: input.address === undefined ? undefined : jsonSnapshot(input.address),
            },
          })
        : await tx.branch.create({
            data: {
              organizationId: organization.id,
              name: input.name,
              code: input.code ?? externalId,
              externalId,
              source: 'BLIZBOOKS',
              status: input.status ?? 'ACTIVE',
              address: input.address === undefined ? undefined : jsonSnapshot(input.address),
            },
          });
      const tenantContext = { ...context, organizationId: organization.id, branchId: branch.id };
      await this.audit.record(
        tenantContext,
        {
          entityType: 'BRANCH',
          entityId: branch.id,
          action: existing ? 'BRANCH_SYNCED' : 'BRANCH_PROVISIONED',
          beforeState: existing ? jsonSnapshot(existing) : undefined,
          afterState: jsonSnapshot(branch),
        },
        tx,
      );
      await this.outbox.append(
        tenantContext,
        {
          aggregateType: 'Branch',
          aggregateId: branch.id,
          aggregateVersion: organization.version,
          eventType: 'branch.changed',
          payload: jsonSnapshot(branch),
        },
        tx,
      );
      return this.branchDto(branch);
    });
  }

  async changeSource(context: DomainContext, toSource: 'NATIVE' | 'BLIZBOOKS') {
    requirePermission(context, 'organizations.source_change');
    requireReason(context, 'An organization source change requires a reason');
    return this.runScoped(context, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
      });
      if (organization.source === toSource)
        throw new ConflictError('Organization already has this source');
      const updated = await tx.organization.update({
        where: { id: organization.id },
        data: { source: toSource, version: { increment: 1 } },
      });
      await tx.organizationSourceChange.create({
        data: {
          organizationId: organization.id,
          fromSource: organization.source,
          toSource,
          reason: context.reason!,
          requestedByUserId: context.actor.userId!,
          correlationId: context.correlationId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: 'ORGANIZATION_SOURCE_CHANGED',
          beforeState: jsonSnapshot(organization),
          afterState: jsonSnapshot(updated),
          reason: context.reason,
        },
        tx,
      );
      return this.toDto(updated);
    });
  }

  async deactivate(context: DomainContext) {
    requirePermission(context, 'organizations.deactivate');
    requireReason(context, 'Deactivation requires a reason');
    return this.runScoped(context, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
      });
      const now = new Date();
      await tx.organization.update({
        where: { id: organization.id },
        data: { status: 'DEACTIVATED', deactivatedAt: now, version: { increment: 1 } },
      });
      await tx.branch.updateMany({
        where: { organizationId: organization.id, status: { not: 'DEACTIVATED' } },
        data: { status: 'DEACTIVATED' },
      });
      await tx.employee.updateMany({
        where: { organizationId: organization.id, status: { not: 'TERMINATED' } },
        data: { status: 'INACTIVE', deactivatedAt: now },
      });
      await tx.userOrganization.updateMany({
        where: { organizationId: organization.id, status: { not: 'REMOVED' } },
        data: { status: 'REMOVED', removedAt: now },
      });
      await tx.authSession.updateMany({
        where: { organizationId: organization.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, revocationReason: 'ORGANIZATION_DEACTIVATED' },
      });
      await tx.federationGrant.updateMany({
        where: { organizationId: organization.id, status: 'ACTIVE' },
        data: { status: 'SUSPENDED', suspendedAt: now, suspensionReason: context.reason },
      });
      await tx.webhookSubscription.updateMany({
        where: { organizationId: organization.id, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: 'ORGANIZATION_DEACTIVATED',
          beforeState: jsonSnapshot(organization),
          reason: context.reason,
        },
        tx,
      );
      return { id: organization.id, status: 'DEACTIVATED' as const };
    });
  }

  async listPlatform() {
    return this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ orderBy: { createdAt: 'desc' }, include: { settings: true } }),
    );
  }

  private runScoped(context: DomainContext, callback: Parameters<TenantDatabaseService['run']>[1]) {
    return context.accessMode === 'PLATFORM'
      ? this.database.runPlatform(context, callback)
      : this.database.run(context, callback);
  }

  private toDto(value: {
    id: string;
    name: string;
    slug: string;
    source: string;
    externalId: string | null;
    status: string;
    timezone: string;
    currencyCode: string;
    locale: string;
    version: number;
  }) {
    return {
      id: value.id,
      name: value.name,
      slug: value.slug,
      source: value.source,
      externalId: value.externalId,
      status: value.status,
      timezone: value.timezone,
      currencyCode: value.currencyCode,
      locale: value.locale,
      version: value.version,
    };
  }

  private branchDto(value: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    source: string;
    externalId: string | null;
    status: string;
    timezone: string | null;
    address: unknown;
  }) {
    return {
      id: value.id,
      organizationId: value.organizationId,
      name: value.name,
      code: value.code,
      source: value.source,
      externalId: value.externalId,
      status: value.status,
      timezone: value.timezone,
      address: value.address,
    };
  }
}
