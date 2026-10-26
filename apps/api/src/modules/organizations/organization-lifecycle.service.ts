import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError, StaleWriteError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { Prisma } from '../../generated/prisma/client';
import { runScoped, toDto } from './organization-shared';

/**
 * The organization record itself: reading it, editing it, changing where it is mastered, and
 * deactivating it.
 *
 * Small on purpose. These are the operations that act on the tenant as a whole rather than on
 * anything inside it.
 */
@Injectable()
export class OrganizationLifecycleService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
  ) {}

  async get(context: DomainContext) {
    requirePermission(context, 'organizations.read');
    const organizationSelect = {
      id: true,
      name: true,
      slug: true,
      source: true,
      externalId: true,
      status: true,
      timezone: true,
      currencyCode: true,
      locale: true,
      version: true,
      settings: true,
      logoFile: true,
      coverFile: true,
    } satisfies Prisma.OrganizationSelect;
    const organization = (await runScoped(this.database, context, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: context.organizationId },
        // Avoid selecting internal employee-numbering state here. Older local databases may
        // not have the federation-owned sequence column yet, and it is not part of this DTO.
        select: organizationSelect,
      });
      if (!organization) throw new NotFoundError('Organization');
      return organization;
    })) as Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;
    const [logoUrl, coverUrl] = await Promise.all([
      organization.logoFile
        ? this.storage.createDownloadUrl(organization.logoFile.objectKey, {
            expiresIn: 86_400,
            contentType: organization.logoFile.contentType,
            inline: true,
          })
        : null,
      organization.coverFile
        ? this.storage.createDownloadUrl(organization.coverFile.objectKey, {
            expiresIn: 86_400,
            contentType: organization.coverFile.contentType,
            inline: true,
          })
        : null,
    ]);
    return { ...toDto(organization), logoUrl, coverUrl };
  }

  async update(
    context: DomainContext,
    version: number,
    input: {
      name?: string;
      timezone?: string;
      currencyCode?: string;
      logoFileId?: string | null;
      coverFileId?: string | null;
    },
  ) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      const before = await tx.organization.findUnique({ where: { id: context.organizationId } });
      if (!before) throw new NotFoundError('Organization');
      for (const fileId of [input.logoFileId, input.coverFileId]) {
        if (fileId === undefined || fileId === null) continue;
        const image = await tx.fileObject.findFirst({
          where: {
            id: fileId,
            organizationId: context.organizationId,
            purpose: 'ORGANIZATION_BRANDING',
            accessScope: 'ORGANIZATION',
            status: 'AVAILABLE',
            deletedAt: null,
            employeeId: null,
            leaveRequestId: null,
            contentType: { startsWith: 'image/' },
          },
          select: { id: true },
        });
        if (!image) throw new NotFoundError('Organization image');
      }
      const updated = await tx.organization.updateMany({
        where: { id: context.organizationId, version },
        data: {
          ...input,
          currencyCode: input.currencyCode?.toUpperCase(),
          logoFileId: input.logoFileId,
          coverFileId: input.coverFileId,
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
          payload: jsonSnapshot(toDto(after)),
        },
        tx,
      );
      return toDto(after);
    });
  }

  async changeSource(context: DomainContext, toSource: 'NATIVE' | 'BLIZBOOKS') {
    requirePermission(context, 'organizations.source_change');
    requireReason(context, 'An organization source change requires a reason');
    return runScoped(this.database, context, async (tx) => {
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
      return toDto(updated);
    });
  }

  async deactivate(context: DomainContext) {
    requirePermission(context, 'organizations.deactivate');
    requireReason(context, 'Deactivation requires a reason');
    return runScoped(this.database, context, async (tx) => {
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
}
