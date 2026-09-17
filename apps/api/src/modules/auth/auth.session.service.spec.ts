import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { AuthSessionService, REVOCATION } from './auth.session.service';
import type { AuthTokenService } from './auth.tokens';

const ORG = '11111111-1111-4111-8111-111111111111';
const FAMILY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type SessionRow = {
  id: string;
  userId: string;
  organizationId: string | null;
  tokenFamily: string;
  status: string;
  expiresAt: Date;
  user: { isActive: boolean; tokenVersion: number };
};

/**
 * `expect.objectContaining` is typed as `any`, which trips `no-unsafe-assignment` when it is
 * nested inside an object literal. Narrowing it to `unknown` keeps the assertion readable.
 */
const containing = (value: Record<string, unknown>): unknown => expect.objectContaining(value);

function activeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    userId: 'user-1',
    organizationId: ORG,
    tokenFamily: FAMILY,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 60_000),
    user: { isActive: true, tokenVersion: 3 },
    ...overrides,
  };
}

function setup(session: SessionRow | null, options: { membership?: boolean } = {}) {
  const tx: {
    authSession: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    userOrganization: { findFirst: jest.Mock };
  } = {
    authSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      create: jest.fn().mockResolvedValue({ id: 'session-2' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userOrganization: {
      findFirst: jest.fn().mockResolvedValue((options.membership ?? true) ? { id: 'm' } : null),
    },
  };
  const database = {
    runSystem: jest.fn(
      (_organizationId: string | undefined, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  const tokens: Partial<AuthTokenService> = {
    hashOpaqueToken: (value: string) => `hash:${value}`,
    createOpaqueToken: () => 'new-refresh-token',
    refreshTokenExpiry: () => new Date(Date.now() + 3_600_000),
    signAccessToken: jest.fn().mockResolvedValue('new-access-token'),
    accessTokenTtlSeconds: 900,
  };
  return {
    tx,
    service: new AuthSessionService(database as never, tokens as unknown as AuthTokenService),
  };
}

describe('AuthSessionService.rotate', () => {
  it('rotates a valid refresh token and carries the token family forward', async () => {
    const { tx, service } = setup(activeSession());
    const issued = await service.rotate('refresh-token');

    expect(issued.accessToken).toBe('new-access-token');
    expect(issued.refreshToken).toBe('new-refresh-token');
    // The presented token is spent before its successor is minted.
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1', status: 'ACTIVE' },
        data: containing({ revocationReason: REVOCATION.rotated }),
      }),
    );
    expect(tx.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: containing({ tokenFamily: FAMILY }) }),
    );
  });

  it('revokes the whole family when an already-rotated token is replayed', async () => {
    const { tx, service } = setup(activeSession({ status: 'REVOKED' }));

    await expect(service.rotate('stolen-token')).rejects.toThrow(UnauthorizedDomainError);
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { tokenFamily: FAMILY, status: 'ACTIVE' },
      data: containing({ revocationReason: REVOCATION.reuseDetected }),
    });
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown refresh token', async () => {
    const { tx, service } = setup(null);
    await expect(service.rotate('never-issued')).rejects.toThrow(UnauthorizedDomainError);
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects an expired refresh token and revokes its session', async () => {
    const { tx, service } = setup(activeSession({ expiresAt: new Date(Date.now() - 1_000) }));
    await expect(service.rotate('expired')).rejects.toThrow(UnauthorizedDomainError);
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects refresh for a deactivated user', async () => {
    const { service } = setup(activeSession({ user: { isActive: false, tokenVersion: 3 } }));
    await expect(service.rotate('valid-but-disabled')).rejects.toThrow(UnauthorizedDomainError);
  });

  it('revokes the family when the tenant membership behind the session is gone', async () => {
    const { tx, service } = setup(activeSession(), { membership: false });

    await expect(service.rotate('valid-token')).rejects.toThrow(UnauthorizedDomainError);
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { tokenFamily: FAMILY, status: 'ACTIVE' },
      data: containing({ revocationReason: REVOCATION.membershipLost }),
    });
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });

  it('reports every failure with the same message', async () => {
    const messageOf = async (row: SessionRow | null, membership = true) => {
      const { service } = setup(row, { membership });
      return service.rotate('token').catch((error: Error) => error.message);
    };

    const messages = await Promise.all([
      messageOf(null),
      messageOf(activeSession({ status: 'REVOKED' })),
      messageOf(activeSession({ expiresAt: new Date(Date.now() - 1_000) })),
      messageOf(activeSession(), false),
    ]);

    expect(new Set(messages).size).toBe(1);
  });
});
