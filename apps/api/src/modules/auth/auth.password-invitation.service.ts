import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { invitationMail, passwordChangedMail } from '../../infrastructure/mail/mail.templates';
import { commitNewPassword } from './auth.password-store';
import { PasswordService } from './auth.passwords';
import { AuthTokenService } from './auth.tokens';

const SETUP_LINK_TTL_HOURS = 72;

export type PreparedInvitation = {
  /** Sends the email. Call it after the caller's transaction commits, never inside it. */
  deliver: () => Promise<void>;
  /** Development only, so the flow can be driven without reading a mailbox. */
  developmentSetupToken?: string;
};

/**
 * The email a new login receives, and the link in it.
 *
 * Whoever onboards someone — a platform operator creating a tenant, or an administrator adding an
 * employee — used to read the temporary password out to them. Now it arrives by email together
 * with a one-time link to choose a permanent password. The link carries a random token, never the
 * password, and sits in the URL fragment (`#setup=`), which browsers do not send to servers,
 * proxies or logs. Until the person chooses their own password, signing in with the temporary one
 * takes them to do that first.
 */
@Injectable()
export class PasswordInvitationService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
    private readonly mail: MailService,
  ) {}

  /** Records the link inside the caller's transaction, and returns the send for after it. */
  async prepare(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      email: string;
      displayName: string;
      organizationName: string;
      temporaryPassword: string;
    },
  ): Promise<PreparedInvitation> {
    const token = this.tokens.createOpaqueToken();
    // A second invitation replaces the first: only the newest link works.
    await tx.passwordResetToken.updateMany({
      where: { userId: input.userId, purpose: 'SETUP_LINK', usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: input.userId,
        purpose: 'SETUP_LINK',
        tokenHash: this.tokens.hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + SETUP_LINK_TTL_HOURS * 3_600_000),
      },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { passwordChangeRequired: true },
    });
    const base =
      this.config.get<string>('APP_PUBLIC_URL') ||
      this.config.get<string>('WEB_ORG_URL') ||
      'http://localhost:3000';
    const message = invitationMail({
      to: input.email,
      displayName: input.displayName,
      organizationName: input.organizationName,
      temporaryPassword: input.temporaryPassword,
      // Only the one-time token: never the address or the temporary password.
      setupUrl: `${base.replace(/\/+$/, '')}/#setup=${token}`,
      expiresInHours: SETUP_LINK_TTL_HOURS,
    });
    return {
      deliver: () => this.mail.send(message),
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentSetupToken: token } : {}),
    };
  }

  /** Who a link belongs to, so the page can show the address before a password is chosen. */
  async preview(token: string): Promise<{ email: string; displayName: string }> {
    const found = await this.database.runSystem(undefined, (tx) =>
      tx.passwordResetToken.findFirst({
        where: {
          tokenHash: this.tokens.hashOpaqueToken(token),
          purpose: 'SETUP_LINK',
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { isActive: true },
        },
        select: { user: { select: { email: true, displayName: true } } },
      }),
    );
    if (!found) throw invalidLink();
    return found.user;
  }

  /** Spends the link on the person's own password. Answers with the address to sign in with. */
  async complete(token: string, password: string): Promise<{ email: string }> {
    const passwordHash = await this.passwords.hashPassword(password);
    const changed = await this.database.runSystem(undefined, async (tx) => {
      const link = await tx.passwordResetToken.findUnique({
        where: { tokenHash: this.tokens.hashOpaqueToken(token) },
      });
      if (!link || link.purpose !== 'SETUP_LINK') throw invalidLink();
      // Claimed with a conditional update, so two tabs submitting the same link cannot both win.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: link.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidLink();
      return commitNewPassword(tx, link.userId, passwordHash, 'PASSWORD_SETUP');
    });
    await this.mail.send(
      passwordChangedMail({ to: changed.email, displayName: changed.displayName }),
    );
    return { email: changed.email };
  }
}

function invalidLink() {
  return new UnauthorizedDomainError(
    'This link has expired or was already used. Sign in with your temporary password, or ask for a new invitation.',
  );
}
