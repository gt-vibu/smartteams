import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
  StaleWriteError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { PasswordService } from '../auth/auth.passwords';
import { OutboxService } from '../federation/outbox.service';
import { FEDERATION_CAPABILITY_CATALOG } from '../federation/federation-capability.catalog';
import { FEDERATION_GRANTABLE_SCOPES } from '../federation/federation-scope.catalog';
import type { AuditContext } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly passwords: PasswordService,
  ) {}

  async listPlatform(userId: string) {
    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      // Required: `runPlatform` refuses any RLS bypass that is not attributable to an operator
      // and a stated purpose. Omitting it makes the whole listing fail closed with a 403.
      reason: 'Platform tenant directory listing',
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };

    return this.database.runPlatform(context, async (tx) => {
      const organizations = await tx.organization.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          settings: true,
          users: {
            where: { status: 'ACTIVE' },
            // Deterministic: the primary administrator is the founding member, so the oldest
            // active membership wins. Without an explicit order the row is whatever Postgres
            // returns first, which would show an arbitrary employee as "Primary Admin" as soon
            // as a tenant has more than one member.
            orderBy: { joinedAt: 'asc' },
            take: 1,
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  lastLoginAt: true,
                },
              },
            },
          },
          _count: {
            select: {
              branches: true,
              // Counts must match the "Active" figure the console renders beside them; an
              // unfiltered count also includes REMOVED and SUSPENDED memberships.
              users: { where: { status: 'ACTIVE' } },
            },
          },
        },
      });

      return organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        source: org.source,
        status: org.status,
        timezone: org.timezone,
        currencyCode: org.currencyCode,
        locale: org.locale,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        deactivatedAt: org.deactivatedAt?.toISOString() ?? null,
        branchCount: org._count.branches,
        userCount: org._count.users,
        adminUser: org.users[0]?.user ?? null,
      }));
    });
  }

  async onboardPlatform(
    userId: string,
    input: {
      name: string;
      slug: string;
      timezone: string;
      currencyCode: string;
      adminEmail: string;
      adminDisplayName: string;
      reason?: string;
    },
  ) {
    const reason = input.reason || 'Super Admin company onboarding';
    const emailNormalized = input.adminEmail.trim().toLowerCase();

    // Generate secure 16-character temporary password with complexity
    const randomChars = randomBytes(9).toString('base64url');
    const temporaryPassword = `ST!${randomChars}9aA`;
    const passwordHash = await this.passwords.hashPassword(temporaryPassword);

    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      reason,
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };

    const result = await this.database.runPlatform(context, async (tx) => {
      // 1. Create Organization
      const organization = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          source: 'NATIVE',
          timezone: input.timezone,
          currencyCode: input.currencyCode.toUpperCase(),
          settings: { create: {} },
        },
      });

      // 2. Create Default Primary Branch
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: 'Headquarters',
          code: 'HQ',
          source: 'NATIVE',
        },
      });

      // 3. Create or find User
      const existingUser = await tx.user.findUnique({
        where: { emailNormalized },
      });

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              displayName: input.adminDisplayName.trim(),
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              email: input.adminEmail.trim(),
              emailNormalized,
              displayName: input.adminDisplayName.trim(),
              passwordHash,
              identityType: 'NATIVE',
            },
          });

      // 4. Create UserOrganization membership
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: organization.id },
        },
        create: {
          userId: user.id,
          organizationId: organization.id,
          status: 'ACTIVE',
          source: 'NATIVE',
        },
        update: {
          status: 'ACTIVE',
          removedAt: null,
        },
      });

      // 5. Create canonical ORG_ADMIN role if not existing in this org
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          code: 'ORG_ADMIN',
          name: 'Organization Admin',
          description: 'Full administrative access to the organization workspace',
          scope: 'ORGANIZATION',
          isSystem: true,
        },
      });

      // 6. Link wildcard permission to ORG_ADMIN
      const wildcardPermission = await tx.permission.upsert({
        where: { key: '*' },
        create: { key: '*', description: 'Administrator wildcard permission' },
        update: {},
      });

      await tx.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: wildcardPermission.id,
        },
      });

      // 7. Assign ORG_ADMIN role to user
      await tx.userRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: role.id,
          assignmentSource: 'NATIVE',
        },
      });

      // 8. Record audit log
      await this.audit.record(
        { ...context, organizationId: organization.id },
        {
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: 'ORGANIZATION_CREATED',
          afterState: jsonSnapshot({
            organization,
            adminUserId: user.id,
            branchId: branch.id,
          }),
          reason,
        },
        tx,
      );

      return {
        organization: this.toDto(organization),
        adminUser: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        branch: this.branchDto(branch),
      };
    });

    return {
      ...result,
      temporaryPassword,
    };
  }

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

  async bootstrapFederated(
    clientId: string,
    externalId: string,
    input: {
      name: string;
      timezone: string;
      currencyCode: string;
      status?: 'ACTIVE' | 'SUSPENDED';
    },
  ) {
    const normalizedExternalId = externalId.trim();
    if (!normalizedExternalId) throw new ConflictError('A BlizBooks tenant identifier is required');
    return this.database.runFederationBootstrap(clientId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${clientId}:${normalizedExternalId}`}, 0))`;
      const client = await tx.federationClient.findUnique({
        where: { id: clientId },
        select: { id: true, status: true, tenantProvisioningEnabled: true },
      });
      if (!client || client.status !== 'ACTIVE' || !client.tenantProvisioningEnabled) {
        throw new ForbiddenDomainError(
          'This federation client is not authorized to provision BlizBooks tenants',
        );
      }
      const existing = await tx.organization.findFirst({
        where: { source: 'BLIZBOOKS', externalId: normalizedExternalId },
      });
      const desiredOrganization = {
        name: input.name.trim(),
        timezone: input.timezone,
        currencyCode: input.currencyCode.toUpperCase(),
        status: input.status ?? ('ACTIVE' as const),
      };
      const organizationChanged =
        !existing ||
        existing.name !== desiredOrganization.name ||
        existing.timezone !== desiredOrganization.timezone ||
        existing.currencyCode !== desiredOrganization.currencyCode ||
        existing.status !== desiredOrganization.status;
      const organization = existing
        ? organizationChanged
          ? await tx.organization.update({
              where: { id: existing.id },
              data: { ...desiredOrganization, version: { increment: 1 } },
            })
          : existing
        : await tx.organization.create({
            data: {
              name: desiredOrganization.name,
              slug: `federated-${randomUUID()}`,
              source: 'BLIZBOOKS',
              externalId: normalizedExternalId,
              timezone: desiredOrganization.timezone,
              currencyCode: desiredOrganization.currencyCode,
              status: desiredOrganization.status,
              settings: { create: {} },
            },
          });
      await this.ensureFederationCapabilities(tx, organization.id);
      const scopeRows = await Promise.all(
        FEDERATION_GRANTABLE_SCOPES.map((code) =>
          tx.federationScope.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
          }),
        ),
      );
      const existingGrant = await tx.federationGrant.findFirst({
        where: {
          clientId,
          organizationId: organization.id,
          branchId: null,
          effect: 'ALLOW',
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'asc' },
      });
      const grant = existingGrant
        ? existingGrant
        : await tx.federationGrant.create({
            data: {
              clientId,
              organizationId: organization.id,
              effect: 'ALLOW',
              status: 'ACTIVE',
              startsAt: new Date(),
              scopes: { create: scopeRows.map(({ id }) => ({ scopeId: id })) },
            },
          });
      if (existingGrant) {
        await tx.federationGrantScope.createMany({
          data: scopeRows.map(({ id }) => ({ grantId: existingGrant.id, scopeId: id })),
          skipDuplicates: true,
        });
      }
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
      const tenantContext = {
        organizationId: organization.id,
        accessMode: 'FEDERATION' as const,
        actor: { type: 'FEDERATION_CLIENT' as const, clientId },
        correlationId: randomUUID(),
        requestId: randomUUID(),
        permissions: new Set<string>(FEDERATION_GRANTABLE_SCOPES),
        scopes: new Set<string>(FEDERATION_GRANTABLE_SCOPES),
      } satisfies DomainContext;
      if (organizationChanged) {
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
      }
      if (!existingGrant) {
        await this.audit.record(
          tenantContext,
          {
            entityType: 'FEDERATION_GRANT',
            entityId: grant.id,
            action: 'FEDERATION_GRANT_PROVISIONED',
            afterState: jsonSnapshot(grant),
          },
          tx,
        );
      }
      if (organizationChanged) {
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
      }
      return this.toDto(organization);
    });
  }

  private async ensureFederationCapabilities(tx: Prisma.TransactionClient, organizationId: string) {
    const capabilities = await Promise.all(
      FEDERATION_CAPABILITY_CATALOG.map((catalogEntry) =>
        tx.federationCapability.upsert({
          where: { code_version: { code: catalogEntry.code, version: catalogEntry.version } },
          create: catalogEntry,
          update: {},
        }),
      ),
    );
    const enabledAt = new Date();
    await Promise.all(
      capabilities.map((capability) =>
        tx.organizationFederationCapability.upsert({
          where: {
            organizationId_capabilityId: { organizationId, capabilityId: capability.id },
          },
          create: {
            organizationId,
            capabilityId: capability.id,
            status: 'ENABLED',
            configuration: {},
            enabledAt,
          },
          update: {},
        }),
      ),
    );
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
