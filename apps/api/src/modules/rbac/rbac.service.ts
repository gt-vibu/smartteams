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

  hasPermission(context: AuthorizationContext, permission: string) {
    return context.permissions.has(permission) || context.permissions.has('*');
  }

  async loadOrganizationPermissions(userId: string, organizationId: string, branchId?: string) {
    const assignments = await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'USER', userId },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.userRole.findMany({
          where: {
            userId,
            organizationId,
            startsAt: { lte: new Date() },
            AND: [
              { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
              ...(branchId ? [{ OR: [{ branchId: null }, { branchId }] }] : []),
            ],
          },
          select: {
            role: {
              select: { permissions: { select: { permission: { select: { key: true } } } } },
            },
          },
        }),
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
