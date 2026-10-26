import { PasswordResetCodeService } from './auth.password-reset-code.service';
import { PasswordChangeService } from './auth.password-change.service';
import { PasswordInvitationService } from './auth.password-invitation.service';
import { invitationMail } from '../../infrastructure/mail/mail.templates';

/**
 * Choosing, resetting and changing a password.
 *
 * The rules pinned here are the ones an attacker would test: a reset request never reveals whether
 * an account exists, a six-digit code survives only a few wrong guesses, an invitation link works
 * once, the current password is required to change it, and nothing a person typed can inject
 * markup into an email.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const config = (env: Record<string, string> = {}) => ({
  get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  getOrThrow: (key: string) => env[key] ?? 'a-test-secret-that-is-long-enough-for-hmac-use',
});
const mail = () => ({ send: jest.fn().mockResolvedValue(undefined) });
const passwords = () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  hashPassword: jest.fn().mockResolvedValue('new-hash'),
  verifyPassword: jest.fn(),
  verifyDecoy: jest.fn().mockResolvedValue(false),
});
const database = (tx: unknown) => ({
  runSystem: jest.fn((_org: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
});
const committedUser = { tokenVersion: 2, email: 'ada@acme.test', displayName: 'Ada' };

describe('reset by code', () => {
  function setup(user: object | null, token: object | null = null) {
    let stored = token as null | {
      id: string;
      tokenHash: string;
      attempts: number;
      usedAt: null;
      revokedAt: null | Date;
    };
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(committedUser),
      },
      authSession: { updateMany: jest.fn() },
      $queryRaw: jest.fn(),
      passwordResetToken: {
        findFirst: jest.fn(() => Promise.resolve(stored)),
        findUniqueOrThrow: jest.fn(() => Promise.resolve(stored)),
        updateMany: jest.fn(),
        create: jest.fn((args: { data: { tokenHash: string } }) => {
          stored = {
            id: 'code-1',
            tokenHash: args.data.tokenHash,
            attempts: 0,
            usedAt: null,
            revokedAt: null,
          };
          return Promise.resolve(stored);
        }),
        update: jest.fn((args: { data: { attempts?: number; revokedAt?: Date } }) => {
          stored = { ...stored!, ...args.data };
          return Promise.resolve(stored);
        }),
      },
    };
    const sent = mail();
    const service = new PasswordResetCodeService(
      config({ NODE_ENV: 'development' }) as never,
      database(tx) as never,
      passwords() as never,
      sent as never,
    );
    return { tx, sent, service, first: () => tx.passwordResetToken.findFirst };
  }
  const ada = { id: USER, email: 'ada@acme.test', displayName: 'Ada' };

  it('answers the same for an address with no account, and sends nothing', async () => {
    const { sent, service } = setup(null);
    await expect(service.request('nobody@acme.test')).resolves.toEqual({ accepted: true });
    expect(sent.send).not.toHaveBeenCalled();
  });

  it('emails a six-digit code that resets the password once', async () => {
    const { tx, sent, service } = setup(ada);
    // No code in the last minute.
    tx.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    const requested = await service.request('Ada@Acme.test');
    expect(requested.developmentCode).toMatch(/^\d{6}$/);
    expect(sent.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@acme.test',
        subject: 'Your Smarteam password reset code',
      }),
    );
    await expect(
      service.confirm('ada@acme.test', requested.developmentCode!, 'a-brand-new-password'),
    ).resolves.toEqual({ email: 'ada@acme.test' });
    // The password is committed through the shared store: sessions revoked, other codes withdrawn.
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: 'new-hash' }) as unknown,
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalled();
  });

  it('withdraws a code after five wrong guesses, even if the sixth is right', async () => {
    const { tx, service } = setup(ada);
    tx.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    const { developmentCode } = await service.request('ada@acme.test');
    const wrong = developmentCode === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 4; attempt += 1)
      await expect(service.confirm('ada@acme.test', wrong, 'a-brand-new-password')).rejects.toThrow(
        'That code is wrong or has expired.',
      );
    await expect(service.confirm('ada@acme.test', wrong, 'a-brand-new-password')).rejects.toThrow(
      'Too many wrong codes',
    );
    tx.passwordResetToken.findFirst.mockResolvedValue(null);
    await expect(
      service.confirm('ada@acme.test', developmentCode!, 'a-brand-new-password'),
    ).rejects.toThrow('That code is wrong or has expired.');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('sends no second code within a minute', async () => {
    const { tx, sent, service } = setup(ada);
    tx.passwordResetToken.findFirst.mockResolvedValueOnce({ id: 'recent' } as never);
    await expect(service.request('ada@acme.test')).resolves.toEqual({ accepted: true });
    expect(sent.send).not.toHaveBeenCalled();
  });
});

describe('invitation link', () => {
  it('records a one-time link, flags the user, and sends only when asked', async () => {
    const tx = {
      passwordResetToken: { updateMany: jest.fn(), create: jest.fn() },
      user: { update: jest.fn() },
    };
    const sent = mail();
    const service = new PasswordInvitationService(
      config({ NODE_ENV: 'development', APP_PUBLIC_URL: 'https://app.acme.test/' }) as never,
      database(tx) as never,
      passwords() as never,
      {
        createOpaqueToken: () => 'x'.repeat(43),
        hashOpaqueToken: (v: string) => `h:${v}`,
      } as never,
      sent as never,
    );
    const prepared = await service.prepare(tx as never, {
      userId: USER,
      email: 'ada@acme.test',
      displayName: 'Ada',
      organizationName: 'Acme',
      temporaryPassword: 'ST!temporary9aA',
    });
    expect(tx.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: 'SETUP_LINK',
        tokenHash: `h:${'x'.repeat(43)}`,
      }) as unknown,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER },
      data: { passwordChangeRequired: true },
    });
    // Nothing is sent inside the caller's transaction.
    expect(sent.send).not.toHaveBeenCalled();
    await prepared.deliver();
    const message = (sent.send.mock.calls[0] as [{ text: string }])[0];
    // The link is in the fragment and carries the token, never the password.
    expect(message.text).toContain(`https://app.acme.test/#setup=${'x'.repeat(43)}`);
    expect(message.text).not.toMatch(/[&?](temp|email)=/);
  });

  it('refuses a link that was already used', async () => {
    const tx = {
      passwordResetToken: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'link', purpose: 'SETUP_LINK', userId: USER }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new PasswordInvitationService(
      config() as never,
      database(tx) as never,
      passwords() as never,
      { hashOpaqueToken: (v: string) => v } as never,
      mail() as never,
    );
    await expect(service.complete('t'.repeat(43), 'a-brand-new-password')).rejects.toThrow(
      'expired or was already used',
    );
  });
});

describe('changing a password while signed in', () => {
  function setup(currentMatches: boolean) {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ passwordHash: 'old', isActive: true }),
        update: jest.fn().mockResolvedValue(committedUser),
      },
      authSession: { updateMany: jest.fn() },
      passwordResetToken: { updateMany: jest.fn() },
    };
    const hashing = passwords();
    hashing.verifyPassword.mockResolvedValue(currentMatches);
    const sessions = { issue: jest.fn().mockResolvedValue({ userId: USER }) };
    const service = new PasswordChangeService(
      database(tx) as never,
      hashing as never,
      sessions as never,
      mail() as never,
    );
    return { tx, sessions, service };
  }
  const input = {
    userId: USER,
    currentPassword: 'old-password',
    newPassword: 'a-brand-new-password',
  };

  it('needs the current password', async () => {
    const { tx, service } = setup(false);
    await expect(service.change(input, {})).rejects.toThrow('current password is not correct');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses the same password again', async () => {
    const { service } = setup(true);
    await expect(
      service.change({ ...input, newPassword: input.currentPassword }, {}),
    ).rejects.toThrow('different from your current one');
  });

  it('commits the change and keeps this person signed in on a fresh session', async () => {
    const { tx, sessions, service } = setup(true);
    await service.change(input, {});
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordChangeRequired: false }) as unknown,
      }),
    );
    expect(sessions.issue).toHaveBeenCalledWith(USER, 2, undefined, {});
  });
});

describe('email templates', () => {
  it('escape what people typed, so a name cannot inject markup', () => {
    const message = invitationMail({
      to: 'ada@acme.test',
      displayName: '<img src=x onerror=alert(1)>',
      organizationName: 'Acme & Sons',
      temporaryPassword: 'ST!temp9aA',
      setupUrl: 'https://app.acme.test/#setup=abc',
      expiresInHours: 72,
    });
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(message.html).toContain('Acme &amp; Sons');
  });
});
