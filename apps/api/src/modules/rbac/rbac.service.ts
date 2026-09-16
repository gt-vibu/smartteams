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

  /**
   * A caller may grant only the authority they already hold.
   *
   * Without this, any principal holding `rbac.write` or `members.write` — permissions HR_ADMIN
   * carries, not just the ORG_ADMIN wildcard — could create a role bundling the tenant wildcard,
   * or assign an existing wildcard role, and reach full administrative control with no privilege
   * higher than "manages people operations." Both `RbacAdminService` and `MembersService` call
   * this before writing a role or a role assignment.
   *
   * Wildcard holders pass unconditionally, which grants them nothing new: `hasPermission` already
   * treats `*` as satisfying every check, so an ORG_ADMIN could reach the same result one way or
   * another. What this closes is every other holder of `rbac.write`.
   */
  assertGrantable(
    context: { permissions: ReadonlySet<string> },
    permissionKeys: readonly string[],
  ) {
    if (context.permissions.has('*')) return;
    const ungranted = permissionKeys.filter((key) => !context.permissions.has(key));
    if (ungranted.length > 0)
      throw new ForbiddenDomainError(
        `Cannot grant a permission you do not hold: ${ungranted.join(', ')}`,
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
