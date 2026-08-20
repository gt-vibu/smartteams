import { Injectable } from '@nestjs/common';
import { RoleScope } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

@Injectable()
export class RbacAdminService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
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
        tx.role.findFirst({ where: { id: input.roleId, organizationId: context.organizationId } }),
      ]);
      if (!user) throw new NotFoundError('User');
      if (!role) throw new NotFoundError('Role');
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
}
