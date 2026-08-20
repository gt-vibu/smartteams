import { Injectable } from '@nestjs/common';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class FederationGrantService {
  constructor(private readonly database: TenantDatabaseService) {}

  async resolve(
    clientId: string,
    organizationId: string,
    branchId: string | undefined,
    scope: string,
  ) {
    const grants = await this.database.run(
      {
        organizationId,
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId },
        correlationId: randomUUID(),
        requestId: randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.federationGrant.findMany({
          where: {
            clientId,
            organizationId,
            status: 'ACTIVE',
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
          },
          include: { scopes: { include: { scope: true } } },
        }),
    );
    const denied = grants.some(
      (grant) =>
        grant.effect === 'DENY' && grant.scopes.some((entry) => entry.scope.code === scope),
    );
    const allowed = grants.some(
      (grant) =>
        grant.effect === 'ALLOW' && grant.scopes.some((entry) => entry.scope.code === scope),
    );
    if (denied || !allowed)
      throw new ForbiddenDomainError(
        'Federation grant does not allow this organization, branch, or scope',
      );
    return { branchId: branchId ?? grants.find((grant) => grant.branchId)?.branchId };
  }

  async listCapabilities(clientId: string, organizationId: string) {
    return this.database.run(
      {
        organizationId,
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId },
        correlationId: randomUUID(),
        requestId: randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.organizationFederationCapability.findMany({
          where: { organizationId, status: 'ENABLED', capability: { isActive: true } },
          select: {
            status: true,
            capability: { select: { code: true, version: true, description: true } },
          },
          orderBy: { capability: { code: 'asc' } },
        }),
    );
  }

  async resolveTarget(
    clientId: string,
    externalOrganizationId: string,
    externalBranchId: string | undefined,
    scope: string,
  ) {
    const organization = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findFirst({
        where: {
          OR: [
            { externalId: externalOrganizationId },
            ...(isUuid(externalOrganizationId) ? [{ id: externalOrganizationId }] : []),
          ],
        },
        select: { id: true },
      }),
    );
    if (!organization)
      throw new ConflictError(
        'Federated tenant must be registered before this operation can be authorized',
      );
    const branch = externalBranchId
      ? await this.database.runSystem(undefined, (tx) =>
          tx.branch.findFirst({
            where: {
              organizationId: organization.id,
              OR: [
                { externalId: externalBranchId },
                ...(isUuid(externalBranchId) ? [{ id: externalBranchId }] : []),
              ],
            },
            select: { id: true },
          }),
        )
      : undefined;
    if (externalBranchId && !branch)
      throw new ConflictError(
        'Federated branch must be registered before this operation can be authorized',
      );
    const resolved = await this.resolve(clientId, organization.id, branch?.id, scope);
    return { organizationId: organization.id, branchId: resolved.branchId ?? branch?.id };
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
