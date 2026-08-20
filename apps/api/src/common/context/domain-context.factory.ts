import { Injectable } from '@nestjs/common';
import { AccessMode } from '../../generated/prisma/enums';
import { RequestContextStore } from './request-context';
import type { DomainContext } from './domain-context';
import { RbacService } from '../../modules/rbac/rbac.service';

@Injectable()
export class DomainContextFactory {
  constructor(
    private readonly contexts: RequestContextStore,
    private readonly rbac: RbacService,
  ) {}

  async native(
    userId: string,
    organizationId: string,
    branchId?: string,
    reason?: string,
  ): Promise<DomainContext> {
    const request = this.contexts.require();
    const permissions = await this.rbac.loadOrganizationPermissions(
      userId,
      organizationId,
      branchId,
    );
    return {
      organizationId,
      branchId,
      reason,
      permissions,
      accessMode: AccessMode.NATIVE,
      actor: { type: 'USER', userId },
      correlationId: request.correlationId,
      requestId: request.requestId,
    };
  }

  federation(
    organizationId: string,
    clientId: string,
    scopes: ReadonlySet<string>,
    permissions = scopes,
    branchId?: string,
    reason?: string,
  ): DomainContext {
    const request = this.contexts.require();
    return {
      organizationId,
      branchId,
      reason,
      permissions,
      scopes,
      accessMode: AccessMode.FEDERATION,
      actor: { type: 'FEDERATION_CLIENT', clientId },
      correlationId: request.correlationId,
      requestId: request.requestId,
    };
  }

  platform(userId: string, reason: string, organizationId: string): DomainContext {
    const request = this.contexts.require();
    return {
      reason,
      organizationId,
      permissions: new Set(['*']),
      accessMode: AccessMode.PLATFORM,
      actor: { type: 'PLATFORM_OPERATOR', userId },
      correlationId: request.correlationId,
      requestId: request.requestId,
    };
  }
}
