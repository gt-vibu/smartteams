import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { AuthService } from './auth.service';
import type { PasswordService } from './auth.passwords';
import type { AuthSessionService } from './auth.session.service';

type UserRow = {
  id: string;
  isActive: boolean;
  passwordHash: string | null;
  tokenVersion: number;
  memberships: Array<{
    organizationId: string;
    status: string;
    organization: { name: string; slug: string; status: string };
  }>;
};

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function membership(organizationId: string, status = 'ACTIVE') {
  return {
    organizationId,
    status,
    organization: { name: `Org ${organizationId.slice(0, 4)}`, slug: 'org', status: 'ACTIVE' },
  };
}

function setup(user: UserRow | null, options: { passwordMatches?: boolean } = {}) {
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
  };
  const database = {
    runSystem: jest.fn(
      (_organizationId: string | undefined, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  const passwords = {
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    verifyPassword: jest.fn().mockResolvedValue(options.passwordMatches ?? true),
    verifyDecoy: jest.fn().mockResolvedValue(false),
  };
  const sessions = {
    issue: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session',
      userId: user?.id ?? 'unknown',
      expiresAt: new Date(),
      expiresIn: 900,
    }),
  };
  return {
    passwords,
    sessions,
    service: new AuthService(
      database as never,
      passwords as unknown as PasswordService,
      sessions as unknown as AuthSessionService,
    ),
  };
}

function activeUser(memberships: UserRow['memberships']): UserRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    isActive: true,
    passwordHash: 'argon2-hash',
    tokenVersion: 0,
    memberships,
  };
}

describe('AuthService.login', () => {
  it('issues a session for valid credentials with a single membership', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A)]));
    const result = await service.login('user@example.com', 'correct-password');

    expect(result.outcome).toBe('AUTHENTICATED');
    expect(sessions.issue).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      0,
      ORG_A,
      {},
    );
  });

  it('rejects an invalid password without issuing a session', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A)]), {
      passwordMatches: false,
    });
    await expect(service.login('user@example.com', 'wrong')).rejects.toThrow(
      UnauthorizedDomainError,
    );
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('burns a decoy verification for an unknown account so timing does not leak existence', async () => {
    const { service, passwords } = setup(null);
    await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(
      UnauthorizedDomainError,
    );
    expect(passwords.verifyDecoy).toHaveBeenCalledWith('whatever');
  });

  it('reports the same error for an unknown account as for a wrong password', async () => {
    const unknown = setup(null);
    const wrong = setup(activeUser([membership(ORG_A)]), { passwordMatches: false });

    const unknownError = await unknown.service
      .login('nobody@example.com', 'x')
      .catch((error: Error) => error.message);
    const wrongError = await wrong.service
      .login('user@example.com', 'x')
      .catch((error: Error) => error.message);

    expect(unknownError).toBe(wrongError);
  });

  it('rejects a deactivated user holding the correct password', async () => {
    const user = { ...activeUser([membership(ORG_A)]), isActive: false };
    const { service, sessions } = setup(user);
    await expect(service.login('user@example.com', 'correct')).rejects.toThrow(
      UnauthorizedDomainError,
    );
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('rejects a user whose only membership is inactive', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A, 'REMOVED')]));
    await expect(service.login('user@example.com', 'correct')).rejects.toThrow(
      UnauthorizedDomainError,
    );
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('requires an explicit selection when the user belongs to several organizations', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A), membership(ORG_B)]));
    const result = await service.login('user@example.com', 'correct');

    expect(result.outcome).toBe('ORGANIZATION_SELECTION_REQUIRED');
    // No arbitrary tenant is chosen, and no session exists until the user picks one.
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('honours an explicit organization the user is a member of', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A), membership(ORG_B)]));
    const result = await service.login('user@example.com', 'correct', ORG_B);

    expect(result.outcome).toBe('AUTHENTICATED');
    expect(sessions.issue).toHaveBeenCalledWith(expect.any(String), 0, ORG_B, {});
  });

  it('refuses an organization the user is not a member of, without confirming it exists', async () => {
    const { service, sessions } = setup(activeUser([membership(ORG_A)]));
    await expect(service.login('user@example.com', 'correct', ORG_B)).rejects.toThrow(
      'Invalid email or password',
    );
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('refuses an organization whose membership is no longer active', async () => {
    const { service } = setup(activeUser([membership(ORG_A), membership(ORG_B, 'REMOVED')]));
    await expect(service.login('user@example.com', 'correct', ORG_B)).rejects.toThrow(
      UnauthorizedDomainError,
    );
  });
});
