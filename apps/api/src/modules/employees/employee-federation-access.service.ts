import { Injectable } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth.session.service';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

/**
 * Whether a federated employee may sign in, and revoking that access.
 *
 * Split from the record sync because it touches users and sessions rather than employment data,
 * and because a partner revoking access is the one path here with an immediate security effect.
 */
@Injectable()
export class EmployeeFederationAccessService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly sessions: AuthSessionService,
  ) {}

  async syncAccess(context: DomainContext, externalEmployeeId: string, permissionKeys: string[]) {
    requirePermission(context, 'employees.access.write');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
        include: { user: true },
      });
      if (!employee?.userId) throw new NotFoundError('Federated employee user');
      const mappedGrant = context.actor.clientId
        ? await tx.federationGrant.findFirst({
            where: {
              clientId: context.actor.clientId,
              organizationId: context.organizationId,
              effect: 'ALLOW',
              status: 'ACTIVE',
              startsAt: { lte: new Date() },
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              AND: [
                {
                  OR: [
                    { branchId: null },
                    ...(context.branchId ? [{ branchId: context.branchId }] : []),
                  ],
                },
              ],
              roleMappings: { some: {} },
            },
            include: { roleMappings: { orderBy: { priority: 'asc' } } },
            orderBy: { createdAt: 'asc' },
          })
        : null;
      const role = mappedGrant?.roleMappings[0]?.roleId
        ? await tx.role.findUniqueOrThrow({ where: { id: mappedGrant.roleMappings[0].roleId } })
        : await tx.role.upsert({
            where: {
              organizationId_code: {
                organizationId: context.organizationId,
                code: `FEDERATED_${employee.id}`,
              },
            },
            create: {
              organizationId: context.organizationId,
              code: `FEDERATED_${employee.id}`,
              name: `Federated access ${employee.employeeNumber}`,
              scope: 'ORGANIZATION',
              isSystem: false,
              permissions: {
                create: permissionKeys.map((key) => ({
                  permission: {
                    connectOrCreate: { where: { key }, create: { key, description: key } },
                  },
                })),
              },
            },
            update: {
              permissions: {
                deleteMany: {},
                create: permissionKeys.map((key) => ({
                  permission: {
                    connectOrCreate: { where: { key }, create: { key, description: key } },
                  },
                })),
              },
            },
          });
      const existingAssignment = await tx.userRole.findFirst({
        where: {
          userId: employee.userId,
          organizationId: context.organizationId,
          roleId: role.id,
          branchId: context.branchId,
        },
      });
      const assignment = existingAssignment
        ? await tx.userRole.update({
            where: { id: existingAssignment.id },
            data: {
              assignmentSource: context.accessMode,
              sourceFederationGrantId: mappedGrant?.id,
              endsAt: null,
            },
          })
        : await tx.userRole.create({
            data: {
              userId: employee.userId,
              organizationId: context.organizationId,
              roleId: role.id,
              branchId: context.branchId,
              assignmentSource: context.accessMode,
              sourceFederationGrantId: mappedGrant?.id,
            },
          });
      await this.audit.record(
        context,
        {
          entityType: 'USER_ROLE',
          entityId: assignment.id,
          action: 'FEDERATED_EMPLOYEE_ACCESS_SYNCED',
          afterState: jsonSnapshot({ employeeId: employee.id, permissionKeys }),
        },
        tx,
      );
      return { employeeId: employee.id, permissionKeys };
    });
  }

  async revokeFederatedSessions(
    context: DomainContext,
    externalEmployeeId: string,
    reason: string,
  ) {
    requirePermission(context, 'employees.sessions.revoke');
    requireReason({ ...context, reason }, 'Session revocation requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
      });
      if (!employee?.userId) throw new NotFoundError('Federated employee user');
      await this.sessions.revokeAllSessions(employee.userId, reason, tx);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_SESSIONS_REVOKED',
          reason,
        },
        tx,
      );
      return { employeeId: employee.id, revoked: true };
    });
  }
}
