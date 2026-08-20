import { Injectable } from '@nestjs/common';
import {
  CredentialStatus,
  FederationClientStatus,
  GrantEffect,
  GrantStatus,
} from '../../generated/prisma/enums';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { FederationAuthService } from '../federation/federation-auth.service';
import type { AuditContext } from '../audit/audit.service';

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly auth: FederationAuthService,
    private readonly audit: AuditService,
  ) {}

  async createClient(
    userId: string,
    input: {
      name: string;
      mtlsRequired: true;
      allowedCertificateFingerprints: string[];
      homeOrganizationId?: string;
      reason: string;
    },
  ) {
    const context = this.platformContext(userId, input.reason, input.homeOrganizationId);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.create({
        data: {
          name: input.name.trim(),
          clientId: `smarteam-${cryptoRandom()}`,
          mtlsRequired: input.mtlsRequired,
          allowedCertificateFingerprints:
            input.allowedCertificateFingerprints.map(normalizeFingerprint),
          homeOrganizationId: input.homeOrganizationId,
          createdByUserId: userId,
        },
      });
      const credential = await this.auth.createCredential(client.id, userId, undefined, tx);
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_CREATED',
          afterState: jsonSnapshot(client),
          reason: input.reason,
        },
        tx,
      );
      return {
        client: { id: client.id, clientId: client.clientId, status: client.status },
        credential,
      };
    });
  }

  async rotateCredential(userId: string, clientId: string, reason: string) {
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.findUnique({ where: { id: clientId } });
      if (!client) throw new NotFoundError('Federation client');
      const credential = await this.auth.createCredential(client.id, userId, undefined, tx);
      await this.audit.record(
        { ...context, organizationId: client.homeOrganizationId ?? undefined },
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_CREDENTIAL_ROTATED',
          afterState: jsonSnapshot({ credentialId: credential.id, keyId: credential.keyId }),
          reason,
        },
        tx,
      );
      return credential;
    });
  }

  async revokeCredential(userId: string, credentialId: string, reason: string) {
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const credential = await tx.federationClientCredential.findUnique({
        where: { id: credentialId },
        include: { client: true },
      });
      if (!credential) throw new NotFoundError('Federation credential');
      const updated = await tx.federationClientCredential.update({
        where: { id: credential.id },
        data: { status: CredentialStatus.REVOKED, revokedAt: new Date() },
      });
      await this.audit.record(
        { ...context, organizationId: credential.client.homeOrganizationId ?? undefined },
        {
          entityType: 'FEDERATION_CLIENT_CREDENTIAL',
          entityId: credential.id,
          action: 'FEDERATION_CLIENT_CREDENTIAL_REVOKED',
          beforeState: jsonSnapshot(credential),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return { id: updated.id, status: updated.status, revokedBy: userId, reason };
    });
  }

  async changeClientStatus(
    userId: string,
    clientId: string,
    status: FederationClientStatus,
    reason: string,
  ) {
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.findUnique({ where: { id: clientId } });
      if (!client) throw new NotFoundError('Federation client');
      if (client.status === status)
        throw new ConflictError('Federation client already has this status');
      const updated = await tx.federationClient.update({
        where: { id: client.id },
        data: {
          status,
          tokenVersion: { increment: 1 },
          revokedAt: status === FederationClientStatus.REVOKED ? new Date() : undefined,
          revocationReason: status === FederationClientStatus.REVOKED ? reason : undefined,
        },
      });
      await this.audit.record(
        { ...context, organizationId: client.homeOrganizationId ?? undefined },
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_STATUS_CHANGED',
          beforeState: jsonSnapshot(client),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return updated;
    });
  }

  async createGrant(
    userId: string,
    input: {
      clientId: string;
      organizationId: string;
      branchId?: string;
      scopes: string[];
      roleIds?: string[];
      effect: GrantEffect;
      startsAt: string;
      endsAt?: string;
      reason: string;
    },
  ) {
    const context = {
      organizationId: input.organizationId,
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: cryptoRandom(),
      requestId: cryptoRandom(),
      permissions: new Set(['*']),
      reason: input.reason,
    };
    return this.database.runPlatform(context, async (tx) => {
      const [client, organization, branch] = await Promise.all([
        tx.federationClient.findUnique({ where: { id: input.clientId } }),
        tx.organization.findUnique({ where: { id: input.organizationId } }),
        input.branchId
          ? tx.branch.findFirst({
              where: { id: input.branchId, organizationId: input.organizationId },
            })
          : Promise.resolve(true),
      ]);
      if (!client) throw new NotFoundError('Federation client');
      if (!organization) throw new NotFoundError('Organization');
      if (input.branchId && !branch) throw new NotFoundError('Branch');
      const startsAt = new Date(input.startsAt);
      const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
      if (endsAt && endsAt <= startsAt)
        throw new ConflictError('Federation grant end must be after its start');
      const scopeRows = await Promise.all(
        input.scopes.map((code) =>
          tx.federationScope.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
          }),
        ),
      );
      const roles = input.roleIds?.length
        ? await tx.role.findMany({
            where: {
              id: { in: input.roleIds },
              OR: [{ organizationId: organization.id }, { organizationId: null }],
            },
            select: { id: true },
          })
        : [];
      if (roles.length !== (input.roleIds?.length ?? 0))
        throw new NotFoundError('One or more federation grant roles');
      const grant = await tx.federationGrant.create({
        data: {
          clientId: client.id,
          organizationId: organization.id,
          branchId: input.branchId,
          effect: input.effect,
          status: GrantStatus.ACTIVE,
          startsAt,
          endsAt,
          createdByUserId: userId,
          scopes: { create: scopeRows.map((scope) => ({ scopeId: scope.id })) },
          roleMappings: { create: roles.map((role, priority) => ({ roleId: role.id, priority })) },
        },
        include: { scopes: { include: { scope: true } }, roleMappings: true },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_GRANT',
          entityId: grant.id,
          action: 'FEDERATION_GRANT_CREATED',
          afterState: jsonSnapshot(grant),
          reason: input.reason,
        },
        tx,
      );
      return grant;
    });
  }

  private platformContext(
    userId: string,
    reason: string,
    organizationId?: string,
  ): Omit<AuditContext, 'organizationId'> & { organizationId?: string } {
    return {
      organizationId,
      accessMode: 'PLATFORM',
      actor: { type: 'PLATFORM_OPERATOR', userId },
      correlationId: cryptoRandom(),
      requestId: cryptoRandom(),
      permissions: new Set(['*']),
      reason,
    };
  }
}

function cryptoRandom() {
  return crypto.randomUUID();
}

function normalizeFingerprint(value: string) {
  return value.replaceAll(':', '').trim().toLowerCase();
}
