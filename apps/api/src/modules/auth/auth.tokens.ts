import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

/** Claims carried by the short-lived access token. None of them is trusted without a DB read. */
export type AccessTokenPayload = {
  /** User id. */
  sub: string;
  /** AuthSession id, so the token can be revoked server-side. */
  sid: string;
  /** User.tokenVersion, so a global revocation invalidates every outstanding token. */
  tv: number;
  /** Tenant the session is scoped to. Absent for platform-operator sessions. */
  organizationId?: string;
};

/**
 * Mints and validates the two token types. Access tokens are signed JWTs; refresh tokens are
 * opaque high-entropy strings persisted only as a SHA-256 digest.
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS', 900);
  }

  get refreshTokenTtlSeconds(): number {
    return this.config.get<number>('JWT_REFRESH_TOKEN_TTL_SECONDS', 2_592_000);
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  /** 256 bits of CSPRNG output. The plaintext is returned to the caller exactly once. */
  createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Refresh, password-reset and invitation tokens are stored as digests so a database
   * disclosure yields no usable credential. SHA-256 is appropriate here because the input is
   * already 256 bits of CSPRNG output rather than a low-entropy secret.
   */
  hashOpaqueToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Digest of an employee access code, over its canonical form.
   *
   * Access codes are the one credential here that a person reads off a screen and types back in,
   * so the two ends must agree on what "the same code" means: `a1b2c3d4e5f6` and `A1B2-C3D4-E5F6`
   * are one code. Normalizing inside the hash is what keeps issuing and redeeming from disagreeing
   * — they cannot drift apart the way two separate call sites would.
   */
  hashAccessCode(code: string): string {
    return this.hashOpaqueToken(normalizeAccessCode(code));
  }

  refreshTokenExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + this.refreshTokenTtlSeconds * 1000);
  }
}

/** Upper case, separators dropped: how a code is compared, never how it is displayed. */
export function normalizeAccessCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
