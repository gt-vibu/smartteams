import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot, type AuditContext } from '../audit/audit.service';
import { FederationClientStatus, GrantStatus } from '../../generated/prisma/enums';
import { FEDERATION_GRANTABLE_SCOPES } from '../federation/federation-scope.catalog';
import type { FederationGrantAccessDto } from './platform-admin.dto';

@Injectable()
export class FederationGrantAdminService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, clientId: string) {
    const context = platformContext(userId, 'List federation client grants');
    return this.database.runPlatform(context, async (tx) => {
      await this.requireClient(tx, clientId);
      const [organizations, grants] = await Promise.all([
        tx.organization.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            externalId: true,
            status: true,
            branches: {
              orderBy: { name: 'asc' },
              select: { id: true, name: true, code: true, status: true },
            },
          },
        }),
        tx.federationGrant.findMany({
          where: { clientId, status: GrantStatus.ACTIVE },
          orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            organizationId: true,
            branchId: true,
            effect: true,
            scopes: { select: { scope: { select: { code: true } } } },
            organization: { select: { name: true } },
            branch: { select: { name: true, code: true } },
          },
        }),
      ]);

      return {
        scopes: [...FEDERATION_GRANTABLE_SCOPES],
        organizations,
        grants: grants.map((grant) => ({
          id: grant.id,
          organizationId: grant.organizationId,
          organizationName: grant.organization.name,
          branchId: grant.branchId,
          branchName: grant.branch?.name ?? null,
          branchCode: grant.branch?.code ?? null,
          effect: grant.effect,
          scopeCodes: grant.scopes.map(({ scope }) => scope.code).sort(),
        })),
      };
    });
  }

  async update(userId: string, clientId: string, input: FederationGrantAccessDto) {
    const scopeCodes = [...new Set(input.scopeCodes.map((code) => code.trim()).filter(Boolean))];
    const validScopes = new Set<string>(FEDERATION_GRANTABLE_SCOPES);
    const invalidScopes = scopeCodes.filter((code) => !validScopes.has(code));
    if (invalidScopes.length > 0) {
      throw new BadRequestException(`Unsupported federation scopes: ${invalidScopes.join(', ')}`);
    }

    const context = platformContext(userId, 'Update federation client grant access');
    return this.database.runPlatform(context, async (tx) => {
      await this.requireClient(tx, clientId);
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, name: true },
      });
      if (!organization) throw new NotFoundError('Organization');

      if (input.branchId) {
        const branch = await tx.branch.findUnique({
          where: { id: input.branchId },
          select: { organizationId: true },
        });
        if (!branch) throw new NotFoundError('Branch');
        if (branch.organizationId !== organization.id) {
          throw new ConflictError('The selected branch does not belong to this organization');
        }
      }

      const existing = await tx.federationGrant.findFirst({
        where: {
          clientId,
          organizationId: organization.id,
          branchId: input.branchId ?? null,
          effect: 'ALLOW',
          status: { in: [GrantStatus.ACTIVE, GrantStatus.SUSPENDED] },
        },
        include: { scopes: { include: { scope: true } } },
      });

      if (scopeCodes.length === 0) {
        if (existing) {
          await tx.federationGrant.update({
            where: { id: existing.id },
            data: { status: GrantStatus.REVOKED, revokedAt: new Date() },
          });
          await this.audit.record(
            context,
            {
              entityType: 'FEDERATION_GRANT',
              entityId: existing.id,
              action: 'FEDERATION_GRANT_REVOKED',
              beforeState: jsonSnapshot(serializeGrant(existing)),
              afterState: jsonSnapshot({
                organizationId: organization.id,
                branchId: input.branchId ?? null,
                effect: 'ALLOW',
                scopeCodes: [],
              }),
            },
            tx,
          );
        }
        return {
          organizationId: organization.id,
          organizationName: organization.name,
          branchId: input.branchId ?? null,
          scopeCodes: [],
        };
      }

      const scopes = await tx.federationScope.findMany({
        where: { code: { in: scopeCodes }, isActive: true },
        select: { id: true, code: true },
      });
      if (scopes.length !== scopeCodes.length) {
        throw new BadRequestException('One or more selected federation scopes are inactive');
      }

      const grant = existing
        ? await this.replaceGrantScopes(
            tx,
            existing.id,
            scopes.map(({ id }) => id),
          )
        : await tx.federationGrant.create({
            data: {
              clientId,
              organizationId: organization.id,
              branchId: input.branchId ?? null,
              effect: 'ALLOW',
              status: GrantStatus.ACTIVE,
              startsAt: new Date(),
              createdByUserId: userId,
              scopes: { create: scopes.map(({ id }) => ({ scopeId: id })) },
            },
            include: { scopes: { include: { scope: true } } },
          });

      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_GRANT',
          entityId: grant.id,
          action: existing ? 'FEDERATION_GRANT_UPDATED' : 'FEDERATION_GRANT_CREATED',
          ...(existing ? { beforeState: jsonSnapshot(serializeGrant(existing)) } : {}),
          afterState: jsonSnapshot(serializeGrant(grant)),
        },
        tx,
      );
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        branchId: grant.branchId,
        scopeCodes: grant.scopes.map(({ scope }) => scope.code).sort(),
      };
    });
  }

  private async requireClient(tx: Prisma.TransactionClient, clientId: string) {
    const client = await tx.federationClient.findUnique({
      where: { id: clientId },
      select: { id: true, status: true },
    });
    if (!client || client.status === FederationClientStatus.REVOKED) {
      throw new NotFoundError('Federation client');
    }
    return client;
  }

  private async replaceGrantScopes(
    tx: Prisma.TransactionClient,
    grantId: string,
    scopeIds: string[],
  ) {
    await tx.federationGrant.update({
      where: { id: grantId },
      data: {
        status: GrantStatus.ACTIVE,
        revokedAt: null,
        suspendedAt: null,
        suspensionReason: null,
      },
    });
    await tx.federationGrantScope.deleteMany({ where: { grantId } });
    await tx.federationGrantScope.createMany({
      data: scopeIds.map((scopeId) => ({ grantId, scopeId })),
    });
    return tx.federationGrant.findUniqueOrThrow({
      where: { id: grantId },
      include: { scopes: { include: { scope: true } } },
    });
  }
}

function serializeGrant(grant: {
  id: string;
  organizationId: string;
  branchId: string | null;
  effect: 'ALLOW' | 'DENY';
  scopes: Array<{ scope: { code: string } }>;
}) {
  return {
    id: grant.id,
    organizationId: grant.organizationId,
    branchId: grant.branchId,
    effect: grant.effect,
    scopeCodes: grant.scopes.map(({ scope }) => scope.code).sort(),
  };
}

function platformContext(
  userId: string,
  reason: string,
): Omit<AuditContext, 'organizationId'> & { organizationId?: string } {
  return {
    accessMode: 'PLATFORM',
    actor: { type: 'PLATFORM_OPERATOR', userId },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['*']),
    reason,
  };
}
