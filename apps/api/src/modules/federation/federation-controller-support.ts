import { Injectable } from '@nestjs/common';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { ConflictError, UnauthorizedDomainError } from '../../common/errors/domain-error';
import { FederationGrantService } from './federation-grant.service';
import type { FederationRequest } from './federation.types';

@Injectable()
export class FederationControllerSupport {
  constructor(
    private readonly grants: FederationGrantService,
    private readonly contexts: DomainContextFactory,
  ) {}

  async context(
    request: FederationRequest,
    organizationId: string,
    scope: string,
    branchId?: string,
    reason?: string,
    actorUserId?: string,
  ) {
    const federation = this.requireFederation(request);
    const target = await this.target(request, organizationId, branchId, scope);
    return this.contexts.federation(
      target.organizationId,
      federation.clientInternalId,
      new Set([scope]),
      new Set([scope]),
      target.branchId,
      reason,
      actorUserId,
    );
  }

  async target(
    request: FederationRequest,
    organizationId: string,
    branchId: string | undefined,
    scope: string,
  ) {
    const federation = this.requireFederation(request);
    if (!organizationId.trim())
      throw new ConflictError('x-organization-id is required for federation operations');
    if (branchId !== undefined && !branchId.trim())
      throw new ConflictError('A federation branch identifier cannot be empty');
    if (!scope.trim()) throw new ConflictError('A federation scope is required');
    return this.grants.resolveTarget(federation.clientInternalId, organizationId, branchId, scope);
  }

  requireFederation(request: FederationRequest) {
    if (!request.federation)
      throw new UnauthorizedDomainError('Federation authentication context is missing');
    return request.federation;
  }
}

export function requireFederatedApprover(value: string | undefined) {
  if (!value?.trim())
    throw new ConflictError('A federation approver employee identifier is required');
  return value;
}
