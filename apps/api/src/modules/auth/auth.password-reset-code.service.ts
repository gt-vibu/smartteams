import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { passwordChangedMail, resetCodeMail } from '../../infrastructure/mail/mail.templates';
import { commitNewPassword } from './auth.password-store';
import { PasswordService } from './auth.passwords';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** A second request inside this window is accepted but sends nothing, so it cannot flood a mailbox. */
const RESEND_AFTER_MS = 60_000;

/**
 * "Forgot password": a six-digit code by email, then a new password.
 *
 * A six-digit code is short enough to type and therefore short enough to guess, so each one allows
 * a handful of wrong tries before it is withdrawn, expires in minutes, and is stored as a keyed
 * hash (HMAC with the server secret, bound to the user) — a copy of the database is not enough to
 * work the codes back out. Asking for a code answers the same way whether or not the address has
 * an account, so the form cannot be used to find out who works where.
 */
@Injectable()
export class PasswordResetCodeService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  async request(email: string): Promise<{ accepted: true; developmentCode?: string }> {
    const user = await this.findUser(email);
    if (!user) return { accepted: true };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const issued = await this.database.runSystem(undefined, async (tx) => {
      const recent = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          purpose: 'RESET_CODE',
          revokedAt: null,
          usedAt: null,
          createdAt: { gt: new Date(Date.now() - RESEND_AFTER_MS) },
        },
        select: { id: true },
      });
      if (recent) return false;
      // Only the newest code works.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, purpose: 'RESET_CODE', usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          purpose: 'RESET_CODE',
          // Suffixed so two codes for one person never collide on the unique column.
          tokenHash: `${this.hash(user.id, code)}:${randomUUID()}`,
          expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
        },
      });
      return true;
    });
    if (!issued) return { accepted: true };

    await this.mail.send(
      resetCodeMail({
        to: user.email,
        displayName: user.displayName,
        code,
        expiresInMinutes: CODE_TTL_MINUTES,
      }),
    );
    return {
      accepted: true,
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentCode: code } : {}),
    };
  }

  async confirm(email: string, code: string, password: string): Promise<{ email: string }> {
    const user = await this.findUser(email);
    if (!user) {
      // Spend the same hashing time as a real attempt, so timing does not reveal the account.
      await this.passwords.verifyDecoy(password);
      throw invalidCode();
    }
    const passwordHash = await this.passwords.hashPassword(password);
    const expected = this.hash(user.id, code.trim());

    const outcome = await this.database.runSystem(undefined, async (tx) => {
      const active = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          purpose: 'RESET_CODE',
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!active) return 'INVALID' as const;
      // Locked, so parallel guesses cannot each read the attempt count before it is raised.
      await tx.$queryRaw`SELECT id FROM password_reset_tokens WHERE id = ${active.id}::uuid FOR UPDATE`;
      const current = await tx.passwordResetToken.findUniqueOrThrow({ where: { id: active.id } });
      if (current.usedAt || current.revokedAt) return 'INVALID' as const;

      if (!matches(current.tokenHash, expected)) {
        const attempts = current.attempts + 1;
        await tx.passwordResetToken.update({
          where: { id: current.id },
          data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { revokedAt: new Date() } : {}) },
        });
        return attempts >= MAX_ATTEMPTS ? ('LOCKED' as const) : ('INVALID' as const);
      }
      await tx.passwordResetToken.update({
        where: { id: current.id },
        data: { usedAt: new Date() },
      });
      await commitNewPassword(tx, user.id, passwordHash, 'PASSWORD_RESET');
      return 'CHANGED' as const;
    });

    if (outcome === 'LOCKED')
      throw new UnauthorizedDomainError('Too many wrong codes. Request a new code and try again.');
    if (outcome !== 'CHANGED') throw invalidCode();
    await this.mail.send(passwordChangedMail({ to: user.email, displayName: user.displayName }));
    return { email: user.email };
  }

  private findUser(email: string) {
    return this.database.runSystem(undefined, (tx) =>
      tx.user.findFirst({
        where: {
          emailNormalized: this.passwords.normalizeEmail(email),
          isActive: true,
          identityType: 'NATIVE',
        },
        select: { id: true, email: true, displayName: true },
      }),
    );
  }

  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`password-reset-code:${userId}:${code}`)
      .digest('hex');
  }
}

/** Compares the stored hash (before its uniqueness suffix) in constant time. */
function matches(stored: string, expected: string): boolean {
  const [hash = ''] = stored.split(':');
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function invalidCode() {
  return new UnauthorizedDomainError('That code is wrong or has expired.');
}
