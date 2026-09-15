import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { RequestContext, RequestContextStore } from '../../common/context/request-context';
import { NativeJwtGuard, type NativeRequestUser } from './jwt.guard';
import type { AuthCookieService } from './auth.cookies';
import type { AccessTokenPayload, AuthTokenService } from './auth.tokens';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';

type Overrides = {
  payload?: Partial<AccessTokenPayload> | null;
  user?: { id: string; isActive: boolean; tokenVersion: number } | null;
  session?: Record<string, unknown> | null;
  membership?: boolean;
  cookieToken?: string;
  header?: string;
};

function setup(overrides: Overrides = {}) {
  const payload: AccessTokenPayload = {
    sub: USER,
    sid: 'session-1',
    tv: 2,
    organizationId: ORG,
    ...overrides.payload,
  };
  const request = {
    headers: overrides.header ? { authorization: overrides.header } : {},
  } as unknown as Request & { user?: NativeRequestUser };

  const tx = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.user === undefined
            ? { id: USER, isActive: true, tokenVersion: 2 }
            : overrides.user,
        ),
    },
    authSession: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.session === undefined
          ? {
              id: 'session-1',
              userId: USER,
              organizationId: ORG,
              status: 'ACTIVE',
              expiresAt: new Date(Date.now() + 60_000),
            }
          : overrides.session,
      ),
    },
    userOrganization: {
      findFirst: jest.fn().mockResolvedValue((overrides.membership ?? true) ? { id: 'm' } : null),
    },
  };
  const database = {
    runSystem: jest.fn(
      (_organizationId: string | undefined, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  const verifyAccessToken = jest.fn(
    overrides.payload === null
      ? () => Promise.reject(new Error('bad signature'))
      : () => Promise.resolve(payload),
  );
  const tokens = { verifyAccessToken } as unknown as AuthTokenService;
  const cookies = {
    readAccessToken: () => overrides.cookieToken ?? (overrides.header ? undefined : 'cookie-token'),
  } as unknown as AuthCookieService;
  const requestContext: RequestContext = {
    requestId: 'r',
    correlationId: 'c',
    accessMode: 'NATIVE',
    actorType: 'SYSTEM',
  };
  const contexts = { require: () => requestContext } as unknown as RequestContextStore;

  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return {
    request,
    requestContext,
    verifyAccessToken,
    guard: new NativeJwtGuard(tokens, cookies, database as never, contexts),
    executionContext,
  };
}

describe('NativeJwtGuard', () => {
  it('authenticates from the HttpOnly session cookie', async () => {
    const { guard, executionContext, request } = setup();
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: USER, sessionId: 'session-1', organizationId: ORG });
  });

  it('still accepts an Authorization bearer header for non-browser callers', async () => {
    const { guard, executionContext, verifyAccessToken } = setup({
      header: 'Bearer service-token',
    });
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('service-token');
  });

  it('rejects a request with no credential at all', async () => {
    const { guard, executionContext } = setup({ cookieToken: '' });
    await expect(guard.canActivate(executionContext)).rejects.toThrow(UnauthorizedDomainError);
  });

  it('rejects a token that fails signature verification', async () => {
    const { guard, executionContext } = setup({ payload: null });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Invalid access token');
  });

  it('rejects a token whose tokenVersion is stale after a global revocation', async () => {
    const { guard, executionContext } = setup({
      user: { id: USER, isActive: true, tokenVersion: 5 },
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Session is invalid');
  });

  it('rejects a revoked session even while the access token is still unexpired', async () => {
    const { guard, executionContext } = setup({
      session: {
        id: 'session-1',
        userId: USER,
        organizationId: ORG,
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Session is invalid');
  });

  it('rejects a deactivated user', async () => {
    const { guard, executionContext } = setup({
      user: { id: USER, isActive: false, tokenVersion: 2 },
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Session is invalid');
  });

  it('rejects once the tenant membership behind the session is revoked', async () => {
    const { guard, executionContext } = setup({ membership: false });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Session is invalid');
  });

  it('rejects a token claiming a different tenant than its session', async () => {
    const { guard, executionContext } = setup({
      payload: { organizationId: '22222222-2222-4222-8222-222222222222' },
    });
    await expect(guard.canActivate(executionContext)).rejects.toThrow('Session is invalid');
  });

  it('records the tenant on the request context so authorization can pin it', async () => {
    const { guard, executionContext, requestContext } = setup();
    await guard.canActivate(executionContext);
    expect(requestContext.organizationId).toBe(ORG);
    expect(requestContext.userId).toBe(USER);
  });
});
