import { Injectable } from '@nestjs/common';
import { ConflictError, UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { passwordChangedMail } from '../../infrastructure/mail/mail.templates';
import { commitNewPassword } from './auth.password-store';
import { PasswordService } from './auth.passwords';
import {
  AuthSessionService,
  type IssuedSession,
  type SessionMetadata,
} from './auth.session.service';

/**
 * Changing your own password while signed in — from the profile, or straight after signing in
 * with a temporary password someone else issued.
 *
 * The current password is required even inside a session, so an unattended browser cannot be used
 * to take the account over. Every other session is signed out; this one is re-issued, so the
 * person who made the change stays signed in.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly mail: MailService,
  ) {}

  async change(
    input: {
      userId: string;
      organizationId?: string;
      currentPassword: string;
      newPassword: string;
    },
    metadata: SessionMetadata,
  ): Promise<IssuedSession> {
    if (input.currentPassword === input.newPassword)
      throw new ConflictError('Choose a password different from your current one.');

    const user = await this.database.runSystem(undefined, (tx) =>
      tx.user.findUnique({
        where: { id: input.userId },
        select: { passwordHash: true, isActive: true },
      }),
    );
    if (
      !user?.isActive ||
      !user.passwordHash ||
      !(await this.passwords.verifyPassword(user.passwordHash, input.currentPassword))
    )
      throw new UnauthorizedDomainError('Your current password is not correct.');

    const passwordHash = await this.passwords.hashPassword(input.newPassword);
    const changed = await this.database.runSystem(undefined, (tx) =>
      commitNewPassword(tx, input.userId, passwordHash, 'PASSWORD_CHANGE'),
    );
    const session = await this.sessions.issue(
      input.userId,
      changed.tokenVersion,
      input.organizationId,
      metadata,
    );
    await this.mail.send(
      passwordChangedMail({ to: changed.email, displayName: changed.displayName }),
    );
    return session;
  }
}
