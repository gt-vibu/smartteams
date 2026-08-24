import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError } from '../../common/errors/domain-error';
import { PrismaService } from './prisma.service';

export type TenantTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

@Injectable()
export class TenantDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    context: DomainContext,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!context.organizationId) {
      throw new ForbiddenDomainError('A tenant organization is required');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${context.actor.userId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.client_id', ${context.actor.clientId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.access_mode', ${context.accessMode}, true)`;
      await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;
      return callback(tx);
    });
  }

  async runPlatform<T>(
    context: Omit<DomainContext, 'organizationId'> & { organizationId?: string },
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (context.accessMode !== 'PLATFORM' || !context.actor.userId || !context.reason?.trim()) {
      throw new ForbiddenDomainError(
        'Platform database bypass requires an audited operator and reason',
      );
    }

    return this.prisma.platform.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${context.actor.userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.client_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.access_mode', 'PLATFORM', true)`;
      await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;
      return callback(tx);
    });
  }

  async runProvisioning<T>(
    context: DomainContext,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (context.accessMode !== 'FEDERATION' || !context.actor.clientId)
      throw new ForbiddenDomainError('Federation provisioning requires a client actor');
    return this.prisma.$transaction(async (tx) => {
      if (!context.organizationId)
        throw new ForbiddenDomainError('Federation provisioning requires a resolved organization');
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.client_id', ${context.actor.clientId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.access_mode', 'FEDERATION', true)`;
      await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;
      return callback(tx);
    });
  }

  async runFederationBootstrap<T>(
    clientId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!clientId.trim())
      throw new ForbiddenDomainError('Federation bootstrap requires a client actor');
    return this.prisma.system.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.client_id', ${clientId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.access_mode', 'FEDERATION', true)`;
      await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;
      return callback(tx);
    });
  }

  async runSystem<T>(
    organizationId: string | undefined,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.system.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.client_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.access_mode', 'PLATFORM', true)`;
      await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;
      return callback(tx);
    });
  }
}
