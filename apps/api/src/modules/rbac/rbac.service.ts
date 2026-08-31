import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { ForbiddenDomainError } from '../../common/errors/domain-error';

export type AuthorizationContext = {
  organizationId: string;
  userId: string;
  permissions: ReadonlySet<string>;
};

@Injectable()
export class RbacService {
  constructor(private readonly database: TenantDatabaseService) {}

  /**
   * `"*"` is the tenant-scoped administrator wildcard. It is only ever reached through the
   * permission set of a single organization, so it grants everything inside that tenant and
   * nothing in any other tenant or on the platform.
   */
  hasPermission(context: AuthorizationContext, permission: string) {
    return context.permissions.has(permission) || context.permissions.has('*');
  }

  /**
   * Resolves the effective permissions a user holds in one organization.
   *
   * Membership is verified first: role assignments are not self-sufficient, because removing a
   * user from an organization sets `UserOrganization.status` without necessarily closing every
   * `UserRole` row. Reading roles alone would let a removed member keep full authority.
   * Returning an empty set here is what makes every downstream `requirePermission` deny.
   */
  async loadOrganizationPermissions(userId: string, organizationId: string, branchId?: string) {
    const now = new Date();
    const assignments = await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'USER', userId },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      async (tx) => {
        const membership = await tx.userOrganization.findFirst({
          where: { userId, organizationId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!membership) return [];
        return tx.userRole.findMany({
          where: {
            userId,
            organizationId,
            startsAt: { lte: now },
            AND: [
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ...(branchId ? [{ OR: [{ branchId: null }, { branchId }] }] : []),
            ],
          },
          select: {
            role: {
              select: { permissions: { select: { permission: { select: { key: true } } } } },
            },
          },
        });
      },
    );
    return new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.map((item) => item.permission.key),
      ),
    );
  }

  async assertOrganizationPermission(
    userId: string,
    organizationId: string,
    permission: string,
    branchId?: string,
  ) {
    const permissions = await this.loadOrganizationPermissions(userId, organizationId, branchId);
    if (!this.hasPermission({ organizationId, userId, permissions }, permission))
      throw new ForbiddenDomainError(`Missing permission: ${permission}`);
    return permissions;
  }
}
