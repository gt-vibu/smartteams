import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenDomainError, UnauthorizedDomainError } from '../../common/errors/domain-error';
import { PlatformAuthGuard } from '../platform/platform-auth.guard';
import type { NativeRequestUser } from '../auth/jwt.guard';

const PLATFORM_USER = '44444444-4444-4444-8444-444444444444';

type GuardOptions = {
  user?: NativeRequestUser;
  platformPermissions?: string[];
  hasOrganizationMembership?: boolean;
};

/**
 * The platform boundary. Platform authority lives in `UserPlatformRole` / `PlatformPermission`,
 * an entirely separate table pair from the tenant `Role` / `Permission` grants, so no amount of
 * tenant authority can reach these endpoints.
 */
function setupGuard(options: GuardOptions = {}) {
  const request = {
    // An explicit `user: undefined` models an unauthenticated request, so `in` is used rather
    // than `??`, which would substitute the default back in.
    user: 'user' in options ? options.user : { userId: PLATFORM_USER, sessionId: 'session-1' },
  } as unknown as Request & { user?: NativeRequestUser };

  const tx = {
    userPlatformRole: {
      findMany: jest.fn().mockResolvedValue(
        (options.platformPermissions ?? ['platform.admin']).map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        })),
      ),
    },
    userOrganization: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.hasOrganizationMembership ? { organizationId: 'org-1' } : null),
    },
  };
  const database = {
    runSystem: jest.fn(
      (_organizationId: string | undefined, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { guard: new PlatformAuthGuard(database as never), executionContext };
}

describe('PlatformAuthGuard — platform vs tenant authority', () => {
  it('admits an operator holding platform.admin', async () => {
    const { guard, executionContext } = setupGuard();
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it('admits an operator holding the platform wildcard', async () => {
    const { guard, executionContext } = setupGuard({ platformPermissions: ['*'] });
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const { guard, executionContext } = setupGuard({ user: undefined });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(UnauthorizedDomainError);
  });

  it('rejects a user with no platform role assignment at all', async () => {
    const { guard, executionContext } = setupGuard({ platformPermissions: [] });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(ForbiddenDomainError);
  });

  it('rejects a tenant ORG_ADMIN: a tenant wildcard is not platform authority', async () => {
    // The tenant `"*"` grant lives on a Role/Permission pair the platform guard never reads.
    const { guard, executionContext } = setupGuard({
      platformPermissions: [],
      hasOrganizationMembership: true,
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(ForbiddenDomainError);
  });

  it('rejects an identity that is both a platform operator and an organization member', async () => {
    // Separation of duties: a platform operator must not also be a tenant user, or a tenant
    // compromise would hand over the platform.
    const { guard, executionContext } = setupGuard({
      platformPermissions: ['platform.admin'],
      hasOrganizationMembership: true,
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      'Platform operators must use a separate identity from organization members',
    );
  });

  it('rejects an operator whose only platform permission is unrelated', async () => {
    const { guard, executionContext } = setupGuard({ platformPermissions: ['platform.read'] });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      'Platform authorization is required',
    );
  });
});
