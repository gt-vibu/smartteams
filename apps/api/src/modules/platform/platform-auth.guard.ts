import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenDomainError, UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { NativeRequestUser } from '../auth/jwt.guard';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly database: TenantDatabaseService) {}
  async canActivate(executionContext: ExecutionContext) {
    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: NativeRequestUser }>();
    if (!request.user) throw new UnauthorizedDomainError();
    const user = request.user;
    return this.database.runSystem(undefined, async (tx) => {
      const [assignments, membership] = await Promise.all([
        tx.userPlatformRole.findMany({
          where: { userId: user.userId, revokedAt: null },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        }),
        tx.userOrganization.findFirst({
          where: { userId: user.userId, status: 'ACTIVE' },
          select: { organizationId: true },
        }),
      ]);
      if (membership)
        throw new ForbiddenDomainError(
          'Platform operators must use a separate identity from organization members',
        );
      const permissions = new Set(
        assignments.flatMap((assignment) =>
          assignment.role.permissions.map((entry) => entry.permission.key),
        ),
      );
      if (!permissions.has('*') && !permissions.has('platform.admin'))
        throw new ForbiddenDomainError('Platform authorization is required');
      return true;
    });
  }
}
