import { Injectable } from '@nestjs/common';
import { AccessMode } from '../../generated/prisma/enums';
import { RequestContextStore } from './request-context';
import type { DomainContext } from './domain-context';
import { ForbiddenDomainError } from '../errors/domain-error';
import { RbacService } from '../../modules/rbac/rbac.service';

@Injectable()
export class DomainContextFactory {
  constructor(
    private readonly contexts: RequestContextStore,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Builds the authorization context for a tenant request.
   *
   * `organizationId` arrives from the route path, so it is caller-controlled and must be
   * proven before it is used. Two independent checks do that:
   *
   *  1. it must equal the organization the *session* was issued for. Without this, a user with
   *     memberships in several tenants could act on tenant B while holding a session scoped to
   *     tenant A, and a platform-scoped session could reach tenant routes at all.
   *  2. the user's membership of that organization must still be ACTIVE, which
   *     `loadOrganizationPermissions` checks as it resolves roles.
   *
   * Only after both hold do the resolved permissions gate the operation, and the resulting
   * context also drives the Postgres RLS variables in `TenantDatabaseService.run`.
   */
  async native(
    userId: string,
    organizationId: string,
    branchId?: string,
    reason?: string,
  ): Promise<DomainContext> {
    const request = this.contexts.require();
    if (request.organizationId !== organizationId) {
      throw new ForbiddenDomainError('The session is not scoped to this organization');
    }
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
    actorUserId?: string,
  ): DomainContext {
    const request = this.contexts.require();
    return {
      organizationId,
      branchId,
      reason,
      permissions,
      scopes,
      accessMode: AccessMode.FEDERATION,
      actor: {
        type: 'FEDERATION_CLIENT',
        clientId,
        ...(actorUserId ? { userId: actorUserId } : {}),
      },
      correlationId: request.correlationId,
      requestId: request.requestId,
    };
  }

  /**
   * Platform-operator context. The `"*"` here is a *platform* wildcard and is only reachable
   * behind `PlatformAuthGuard`, which requires a `UserPlatformRole` and refuses any identity
   * that also holds an organization membership. It is unrelated to the tenant-scoped `"*"`
   * granted to `ORG_ADMIN`.
   */
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
