import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { PasswordService } from './auth.passwords';
import { AuthTokenService } from './auth.tokens';

const RESET_TOKEN_TTL_MS = 3_600_000;

/** Password reset issuance and redemption. */
@Injectable()
export class AuthRecoveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
  ) {}

  /**
   * Always reports `accepted: true`, whether or not the address resolves to a member, so the
   * endpoint cannot be used to test which emails belong to an organization.
   */
  async requestPasswordReset(email: string, organizationId: string) {
    const user = await this.database.runSystem(organizationId, (tx) =>
      tx.user.findFirst({
        where: {
          emailNormalized: this.passwords.normalizeEmail(email),
          memberships: { some: { organizationId, status: 'ACTIVE' } },
          isActive: true,
        },
        select: { id: true },
      }),
    );
    if (!user) return { accepted: true };

    const token = this.tokens.createOpaqueToken();
    await this.database.runSystem(organizationId, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.tokens.hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    );
    return {
      accepted: true,
      delivery: 'configured',
      // Local development convenience only. The environment schema treats anything other than
      // `development` as production-like, so this branch cannot execute in staging or prod.
      developmentToken: this.config.get('NODE_ENV') === 'development' ? token : undefined,
    };
  }

  /**
   * Redeeming a reset token bumps `tokenVersion` and revokes every active session, so a
   * password change immediately logs out anyone holding a stolen token.
   */
  async resetPassword(token: string, password: string) {
    const tokenHash = this.tokens.hashOpaqueToken(token);
    const passwordHash = await this.passwords.hashPassword(password);
    await this.database.runSystem(undefined, async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!reset) throw invalidReset();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidReset();
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.authSession.updateMany({
        where: { userId: reset.userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'PASSWORD_RESET' },
      });
    });
    return { success: true };
  }
}

function invalidReset() {
  return new UnauthorizedDomainError('Password reset token is invalid or expired');
}
