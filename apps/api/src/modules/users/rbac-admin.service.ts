import { Injectable } from '@nestjs/common';
import { RoleScope } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class RbacAdminService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async listRoles(context: DomainContext) {
    requirePermission(context, 'rbac.read');
    return this.database.run(context, (tx) =>
      tx.role.findMany({
        where: { organizationId: context.organizationId },
        include: { permissions: { include: { permission: true } } },
        orderBy: { code: 'asc' },
      }),
    );
  }
  async createRole(
    context: DomainContext,
    input: {
      code: string;
      name: string;
      scope: RoleScope;
      branchId?: string;
      permissionKeys: string[];
    },
  ) {
    requirePermission(context, 'rbac.write');
    // Holding `rbac.write` authorizes managing roles, not minting arbitrary authority — a role
    // can only be created carrying permissions the creator already holds. See `assertGrantable`.
    this.rbac.assertGrantable(context, input.permissionKeys);
    return this.database.run(context, async (tx) => {
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const role = await tx.role.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          scope: input.scope,
          branchId: input.branchId,
          createdByUserId: context.actor.userId,
          permissions: {
            create: input.permissionKeys.map((key) => ({
              permission: {
                connectOrCreate: { where: { key }, create: { key, description: key } },
              },
            })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ROLE',
          entityId: role.id,
          action: 'ROLE_CREATED',
          afterState: jsonSnapshot(role),
        },
        tx,
      );
      return role;
    });
  }
  async assign(
    context: DomainContext,
    input: { userId: string; roleId: string; branchId?: string; endsAt?: string },
  ) {
    requirePermission(context, 'rbac.write');
    return this.database.run(context, async (tx) => {
      const [user, role] = await Promise.all([
        tx.user.findUnique({ where: { id: input.userId } }),
        tx.role.findFirst({
          where: { id: input.roleId, organizationId: context.organizationId },
          include: { permissions: { include: { permission: true } } },
        }),
      ]);
      if (!user) throw new NotFoundError('User');
      if (!role) throw new NotFoundError('Role');
      // Assigning a role hands the holder everything that role carries, so it is subject to the
      // same rule as creating one: a caller cannot grant authority they do not have themselves.
      // This is what stops an `rbac.write` holder short of the wildcard from assigning the
      // organization's own ORG_ADMIN role — to anyone, including themselves.
      this.rbac.assertGrantable(
        context,
        role.permissions.map((entry) => entry.permission.key),
      );
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const membership = await tx.userOrganization.findFirst({
        where: { userId: input.userId, organizationId: context.organizationId, status: 'ACTIVE' },
      });
      if (!membership) throw new ConflictError('User is not an active organization member');
      const assignment = await tx.userRole.create({
        data: {
          userId: input.userId,
          organizationId: context.organizationId,
          roleId: role.id,
          branchId: input.branchId,
          assignmentSource: 'NATIVE',
          grantedByUserId: context.actor.userId,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'USER_ROLE',
          entityId: assignment.id,
          action: 'ROLE_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      return assignment;
    });
  }

  /**
   * Ends a role assignment.
   *
   * `endsAt` is set to now rather than the row deleted, for the same reason `assign` supports a
   * future `endsAt` in the first place: `loadOrganizationPermissions` already excludes any
   * assignment whose window has closed, so this takes effect on the caller's very next request
   * without a special case, and the assignment's history — who granted it, when, and now when it
   * ended — survives for audit.
   *
   * Guarded by the same rule as granting one: a caller may only end a role assignment whose
   * permissions they could have granted themselves. Without that, a caller holding only
   * `rbac.write` could strip the organization's actual administrator of their own access —
   * not an escalation, but the same authority boundary in reverse, and just as much a path to
   * taking over a tenant.
   */
  async revoke(context: DomainContext, userRoleId: string) {
    requirePermission(context, 'rbac.write');
    return this.database.run(context, async (tx) => {
      const assignment = await tx.userRole.findFirst({
        where: { id: userRoleId, organizationId: context.organizationId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      if (!assignment) throw new NotFoundError('Role assignment');
      this.rbac.assertGrantable(
        context,
        assignment.role.permissions.map((entry) => entry.permission.key),
      );
      const now = new Date();
      if (assignment.endsAt && assignment.endsAt <= now) return assignment;
      const updated = await tx.userRole.update({
        where: { id: assignment.id },
        data: { endsAt: now },
      });
      await this.audit.record(
        context,
        {
          entityType: 'USER_ROLE',
          entityId: assignment.id,
          action: 'ROLE_REVOKED',
          beforeState: jsonSnapshot(assignment),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }
}
