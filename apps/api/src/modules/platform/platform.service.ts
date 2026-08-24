import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CredentialStatus,
  FederationClientStatus,
  FederationEnvironment,
  GrantStatus,
  WebhookSubscriptionStatus,
} from '../../generated/prisma/enums';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot, type AuditContext } from '../audit/audit.service';
import { FederationAuthService } from '../federation/federation-auth.service';

type ClientTransportInput = {
  mtlsRequired: boolean;
  allowedCertificateFingerprints: string[];
};

type ClientRow = {
  id: string;
  name: string;
  clientId: string;
  environment: FederationEnvironment;
  status: FederationClientStatus;
  mtlsRequired: boolean;
  allowedCertificateFingerprints: string[];
  createdAt: Date;
  updatedAt: Date;
  credentials?: Array<{ lastUsedAt: Date | null }>;
};

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly auth: FederationAuthService,
    private readonly audit: AuditService,
  ) {}

  async listClients(userId: string) {
    const context = this.platformContext(userId, 'List federation clients');
    return this.database.runPlatform(context, async (tx) => {
      const clients = await tx.federationClient.findMany({
        where: { status: { not: FederationClientStatus.REVOKED } },
        orderBy: [{ createdAt: 'desc' }, { clientId: 'asc' }],
        include: {
          credentials: {
            where: { lastUsedAt: { not: null } },
            orderBy: { lastUsedAt: 'desc' },
            take: 1,
            select: { lastUsedAt: true },
          },
        },
      });
      return clients.map((client) => this.serialize(client));
    });
  }

  async createClient(
    userId: string,
    input: ClientTransportInput & {
      name: string;
      clientId: string;
      environment: FederationEnvironment;
      isActive: boolean;
    },
  ) {
    const reason = `Create federation client ${input.clientId.trim()}`;
    const context = this.platformContext(userId, reason);
    const fingerprints = validateTransport(input.environment, input);
    try {
      return await this.database.runPlatform(context, async (tx) => {
        const duplicate = await tx.federationClient.findUnique({
          where: { clientId: input.clientId.trim() },
          select: { id: true },
        });
        if (duplicate) throw new ConflictError('A federation client already uses this client ID');

        const client = await tx.federationClient.create({
          data: {
            name: input.name.trim(),
            clientId: input.clientId.trim(),
            environment: input.environment,
            status: input.isActive
              ? FederationClientStatus.ACTIVE
              : FederationClientStatus.SUSPENDED,
            mtlsRequired: input.mtlsRequired,
            allowedCertificateFingerprints: fingerprints,
            tenantProvisioningEnabled: true,
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
          },
          tx,
        );
        return { ...this.serialize(client), clientSecret: credential.clientSecret };
      });
    } catch (error) {
      if (isUniqueError(error)) {
        throw new ConflictError('A federation client already uses this client ID');
      }
      throw error;
    }
  }

  async rotateCredential(userId: string, clientId: string) {
    const reason = 'Rotate federation client secret';
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.findUnique({ where: { id: clientId } });
      if (!client || client.status === FederationClientStatus.REVOKED)
        throw new NotFoundError('Federation client');

      const credential = await this.auth.createCredential(client.id, userId, undefined, tx);
      const now = new Date();
      await Promise.all([
        tx.federationClientCredential.updateMany({
          where: {
            clientId: client.id,
            id: { not: credential.id },
            status: CredentialStatus.ACTIVE,
          },
          data: { status: CredentialStatus.REVOKED, revokedAt: now },
        }),
        tx.federationClient.update({
          where: { id: client.id },
          data: { tokenVersion: { increment: 1 } },
        }),
      ]);
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_CREDENTIAL_ROTATED',
          afterState: jsonSnapshot({ credentialId: credential.id, keyId: credential.keyId }),
        },
        tx,
      );
      return { ...this.serialize(client), clientSecret: credential.clientSecret };
    });
  }

  async updateCertificateFingerprints(
    userId: string,
    clientId: string,
    input: ClientTransportInput,
  ) {
    const reason = 'Update federation client certificate configuration';
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.findUnique({ where: { id: clientId } });
      if (!client || client.status === FederationClientStatus.REVOKED)
        throw new NotFoundError('Federation client');
      const fingerprints = validateTransport(client.environment, input);
      const updated = await tx.federationClient.update({
        where: { id: client.id },
        data: {
          mtlsRequired: input.mtlsRequired,
          allowedCertificateFingerprints: fingerprints,
          tokenVersion: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_CERTIFICATES_UPDATED',
          beforeState: jsonSnapshot(client),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return this.serialize(updated);
    });
  }

  setClientEnabled(userId: string, clientId: string, enabled: boolean) {
    return this.changeClientStatus(
      userId,
      clientId,
      enabled ? FederationClientStatus.ACTIVE : FederationClientStatus.SUSPENDED,
      enabled ? 'Enable federation client' : 'Disable federation client',
    );
  }

  async deleteClient(userId: string, clientId: string) {
    const reason = 'Delete federation client';
    const context = this.platformContext(userId, reason);
    return this.database.runPlatform(context, async (tx) => {
      const client = await tx.federationClient.findUnique({ where: { id: clientId } });
      if (!client || client.status === FederationClientStatus.REVOKED)
        throw new NotFoundError('Federation client');
      if (client.status === FederationClientStatus.ACTIVE)
        throw new ConflictError('Disable the federation client before deleting it');

      const now = new Date();
      await Promise.all([
        tx.federationClientCredential.updateMany({
          where: { clientId: client.id, status: CredentialStatus.ACTIVE },
          data: { status: CredentialStatus.REVOKED, revokedAt: now },
        }),
        tx.federationGrant.updateMany({
          where: { clientId: client.id, status: GrantStatus.ACTIVE },
          data: { status: GrantStatus.REVOKED, revokedAt: now },
        }),
        tx.webhookSubscription.updateMany({
          where: { clientId: client.id, status: WebhookSubscriptionStatus.ACTIVE },
          data: { status: WebhookSubscriptionStatus.REVOKED, revokedAt: now },
        }),
      ]);
      const revoked = await tx.federationClient.update({
        where: { id: client.id },
        data: {
          status: FederationClientStatus.REVOKED,
          tokenVersion: { increment: 1 },
          revokedAt: now,
          revocationReason: reason,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_DELETED',
          beforeState: jsonSnapshot(client),
          afterState: jsonSnapshot(revoked),
        },
        tx,
      );
      return { id: client.id, deleted: true };
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
      if (!client || client.status === FederationClientStatus.REVOKED)
        throw new NotFoundError('Federation client');
      if (status === FederationClientStatus.REVOKED)
        throw new ConflictError('Use the delete operation to revoke a federation client');
      if (client.status === status)
        throw new ConflictError('Federation client already has this status');
      const updated = await tx.federationClient.update({
        where: { id: client.id },
        data: { status, tokenVersion: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FEDERATION_CLIENT',
          entityId: client.id,
          action: 'FEDERATION_CLIENT_STATUS_CHANGED',
          beforeState: jsonSnapshot(client),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return this.serialize(updated);
    });
  }

  private serialize(client: ClientRow) {
    return {
      id: client.id,
      name: client.name,
      clientId: client.clientId,
      environment: client.environment,
      status: client.status,
      isActive: client.status === FederationClientStatus.ACTIVE,
      mtlsRequired: client.mtlsRequired,
      allowedCertificateFingerprints: client.allowedCertificateFingerprints,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      lastUsedAt: client.credentials?.[0]?.lastUsedAt?.toISOString() ?? null,
    };
  }

  private platformContext(
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
}

function validateTransport(environment: FederationEnvironment, input: ClientTransportInput) {
  if (environment === FederationEnvironment.PRODUCTION && !input.mtlsRequired) {
    throw new BadRequestException('Production federation clients must require mTLS');
  }
  if (input.mtlsRequired && input.allowedCertificateFingerprints.length === 0) {
    throw new BadRequestException(
      'At least one client certificate fingerprint is required when mTLS is enabled',
    );
  }
  return input.mtlsRequired
    ? [...new Set(input.allowedCertificateFingerprints.map(normalizeFingerprint))]
    : [];
}

function normalizeFingerprint(value: string) {
  return value.replaceAll(':', '').trim().toLowerCase();
}

function isUniqueError(error: unknown): error is { code: 'P2002' } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
