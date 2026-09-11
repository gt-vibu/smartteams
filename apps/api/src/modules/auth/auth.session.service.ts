import { Injectable, Logger } from '@nestjs/common';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuthTokenService } from './auth.tokens';

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  organizationId?: string;
  userId: string;
  expiresAt: Date;
  expiresIn: number;
};

export type SessionMetadata = { ipAddress?: string; userAgent?: string };

/** Values recorded on `AuthSession.revocationReason`. */
export const REVOCATION = {
  rotated: 'ROTATED',
  logout: 'USER_LOGOUT',
  reuseDetected: 'REFRESH_TOKEN_REUSE_DETECTED',
  membershipLost: 'MEMBERSHIP_REVOKED',
} as const;

/**
 * Owns the session lifecycle: creation, rotation with reuse detection, and revocation.
 *
 * Rotation is single-use. Each refresh issues a new session inheriting the presenting
 * session's `tokenFamily`, so an entire login lineage can be revoked at once when a token that
 * was already spent is replayed.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly tokens: AuthTokenService,
  ) {}

  async issue(
    userId: string,
    tokenVersion: number,
    organizationId?: string,
    metadata: SessionMetadata = {},
    tokenFamily?: string,
  ): Promise<IssuedSession> {
    const refreshToken = this.tokens.createOpaqueToken();
    const expiresAt = this.tokens.refreshTokenExpiry();
    const session = await this.database.runSystem(organizationId, (tx) =>
      tx.authSession.create({
        data: {
          userId,
          organizationId,
          refreshTokenHash: this.tokens.hashOpaqueToken(refreshToken),
          ...(tokenFamily ? { tokenFamily } : {}),
          expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    );
    const accessToken = await this.tokens.signAccessToken({
      sub: userId,
      sid: session.id,
      tv: tokenVersion,
      organizationId,
    });
    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      organizationId,
      userId,
      expiresAt,
      expiresIn: this.tokens.accessTokenTtlSeconds,
    };
  }

  /**
   * Exchanges a refresh token for a new session.
   *
   * Every failure path returns the same opaque error, so a caller cannot distinguish an
   * unknown token from a revoked, expired or reused one. A token that is recognised but no
   * longer `ACTIVE` is treated as theft: the whole token family is revoked, logging out both
   * the attacker and the legitimate holder and forcing re-authentication.
   */
  async rotate(refreshToken: string, metadata: SessionMetadata = {}): Promise<IssuedSession> {
    const session = await this.database.runSystem(undefined, (tx) =>
      tx.authSession.findUnique({
        where: { refreshTokenHash: this.tokens.hashOpaqueToken(refreshToken) },
        include: { user: { select: { isActive: true, tokenVersion: true } } },
      }),
    );
    if (!session) throw invalidRefresh();

    if (session.status !== 'ACTIVE') {
      await this.revokeFamily(session.tokenFamily, REVOCATION.reuseDetected);
      this.logger.warn(
        `Refresh token reuse detected; revoked session family for user ${session.userId}`,
      );
      throw invalidRefresh();
    }
    if (session.expiresAt <= new Date() || !session.user.isActive) {
      await this.revoke(session.id, REVOCATION.rotated);
      throw invalidRefresh();
    }
    // Membership can be revoked while a long-lived refresh token is outstanding; re-check it
    // rather than letting a removed member renew their session for the next 30 days.
    if (session.organizationId && !(await this.hasActiveMembership(session))) {
      await this.revokeFamily(session.tokenFamily, REVOCATION.membershipLost);
      throw invalidRefresh();
    }

    // Claim the presented token before minting its successor. `updateMany` with a status guard
    // makes the claim atomic, so two concurrent refreshes cannot both succeed.
    const claimed = await this.database.runSystem(session.organizationId ?? undefined, (tx) =>
      tx.authSession.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: REVOCATION.rotated },
      }),
    );
    if (claimed.count !== 1) throw invalidRefresh();

    return this.issue(
      session.userId,
      session.user.tokenVersion,
      session.organizationId ?? undefined,
      metadata,
      session.tokenFamily,
    );
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.database.runSystem(undefined, (tx) =>
      tx.authSession.updateMany({
        where: { id: sessionId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      }),
    );
  }

  async revokeFamily(tokenFamily: string, reason: string): Promise<void> {
    await this.database.runSystem(undefined, (tx) =>
      tx.authSession.updateMany({
        where: { tokenFamily, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      }),
    );
  }

  /**
   * Global revocation: bumps `tokenVersion` so outstanding access tokens fail their next guard
   * check, and revokes every active session.
   */
  async revokeAllSessions(
    userId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const revoke = async (client: Prisma.TransactionClient) => {
      await client.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await client.authSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      });
    };
    if (tx) return revoke(tx);
    await this.database.runSystem(undefined, revoke);
  }

  private async hasActiveMembership(session: {
    userId: string;
    organizationId: string | null;
  }): Promise<boolean> {
    const organizationId = session.organizationId;
    if (!organizationId) return true;
    const membership = await this.database.runSystem(organizationId, (tx) =>
      tx.userOrganization.findFirst({
        where: { userId: session.userId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      }),
    );
    return membership !== null;
  }
}

function invalidRefresh() {
  return new UnauthorizedDomainError('The session could not be refreshed');
}
