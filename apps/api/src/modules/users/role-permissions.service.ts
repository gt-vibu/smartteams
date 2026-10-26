import { Injectable } from '@nestjs/common';
import { PERMISSION_KEYS } from '@smarteam/contracts';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';

/** The one role whose authority is the whole organization, and is never edited here. */
const ADMINISTRATOR_ROLE = 'ORG_ADMIN';

/**
 * Changing what a role may do.
 *
 * Roles could be created with permissions and assigned to people, but an existing role's
 * permissions could not be changed: an organization that wanted managers to see payroll, or HR to
 * stop editing shifts, had to create a new role and move everyone onto it.
 *
 * The change replaces the role's set and takes effect on each holder's next request — permissions
 * are read per request, never cached in the session. It is refused for:
 *
 *  - the administrator role, which holds the tenant wildcard: editing it could leave nobody able
 *    to manage the organization, and it is the way back from any other mistake;
 *  - a permission the API does not enforce, which would silently do nothing, and the wildcard;
 *  - granting or removing what the caller does not hold themselves (`assertGrantable`);
 *  - a caller removing `rbac.write` from a role they hold, which would lock them out of the very
 *    screen they would use to undo it.
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async replace(
    context: DomainContext,
    roleId: string,
    input: { permissionKeys: string[]; reason: string },
  ) {
    requirePermission(context, 'rbac.write');
    requireReason({ ...context, reason: input.reason }, 'Changing a role requires a reason');
    const wanted = [...new Set(input.permissionKeys.map((key) => key.trim()))];
    const unknown = wanted.filter((key) => !PERMISSION_KEYS.has(key));
    if (unknown.length > 0)
      throw new ConflictError(
        `These are not permissions the application uses: ${unknown.join(', ')}`,
      );

    return this.database.run(context, async (tx) => {
      // Locked, so two administrators editing the same role cannot interleave their changes.
      await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const role = await tx.role.findFirst({
        where: { id: roleId, organizationId: context.organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundError('Role');
      const current = role.permissions.map((entry) => entry.permission.key);
      if (role.code === ADMINISTRATOR_ROLE || current.includes('*'))
        throw new ConflictError(
          'The Organization Admin role always has full access and cannot be edited',
        );

      const added = wanted.filter((key) => !current.includes(key));
      const removed = current.filter((key) => !wanted.includes(key));
      if (added.length === 0 && removed.length === 0) return role;

      this.rbac.assertGrantable(context, added);
      // Taking authority away is held to the same line as granting it: someone who manages roles
      // without the wildcard changes only permissions they hold themselves.
      const unheld = context.permissions.has('*')
        ? []
        : removed.filter((key) => !context.permissions.has(key));
      if (unheld.length > 0)
        throw new ForbiddenDomainError(
          `Cannot remove a permission you do not hold: ${unheld.join(', ')}`,
        );
      if (removed.includes('rbac.write') && !context.permissions.has('*')) {
        const holdsRole = await tx.userRole.findFirst({
          where: {
            organizationId: context.organizationId,
            roleId: role.id,
            userId: context.actor.userId,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          select: { id: true },
        });
        if (holdsRole)
          throw new ForbiddenDomainError(
            'You cannot remove role management from a role you hold — you would lose access to change it back',
          );
      }

      if (removed.length > 0)
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permission: { key: { in: removed } } },
        });
      for (const key of added) {
        const permission = await tx.permission.upsert({
          where: { key },
          create: { key, description: key },
          update: {},
        });
        await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }

      const updated = await tx.role.findUniqueOrThrow({
        where: { id: role.id },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit.record(
        { ...context, reason: input.reason },
        {
          entityType: 'ROLE',
          entityId: role.id,
          action: 'ROLE_PERMISSIONS_UPDATED',
          beforeState: jsonSnapshot({ permissions: current }),
          afterState: jsonSnapshot({ permissions: wanted, added, removed }),
          reason: input.reason,
        },
        tx,
      );
      return updated;
    });
  }
}
