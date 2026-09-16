import { Injectable } from '@nestjs/common';
import type { OrganizationMembership } from '@smarteam/contracts';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { PasswordService } from './auth.passwords';
import {
  AuthSessionService,
  REVOCATION,
  type IssuedSession,
  type SessionMetadata,
} from './auth.session.service';

/**
 * Login outcomes. `ORGANIZATION_SELECTION_REQUIRED` is returned instead of silently choosing a
 * tenant for a user who belongs to several.
 */
export type LoginOutcome =
  | { outcome: 'AUTHENTICATED'; session: IssuedSession }
  | { outcome: 'ORGANIZATION_SELECTION_REQUIRED'; organizations: OrganizationMembership[] };

/** One message for every credential failure, so responses cannot be used to enumerate users. */
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
  ) {}

  /**
   * Authenticates a tenant user.
   *
   * `organizationId` is a *selection*, never an authorization input: it is honoured only when
   * the authenticated user holds an ACTIVE membership of that organization, and any other
   * value is rejected with the same opaque error as a wrong password.
   */
  async login(
    email: string,
    password: string,
    organizationId?: string,
    metadata: SessionMetadata = {},
  ): Promise<LoginOutcome> {
    const user = await this.findByEmail(email);
    if (!user?.passwordHash) {
      // Burn an equivalent argon2 verification so a missing account is not faster to reject
      // than a wrong password.
      await this.passwords.verifyDecoy(password);
      throw new UnauthorizedDomainError(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verifyPassword(user.passwordHash, password)) || !user.isActive) {
      throw new UnauthorizedDomainError(INVALID_CREDENTIALS);
    }

    const memberships = user.memberships.filter((membership) => membership.status === 'ACTIVE');
    if (memberships.length === 0) throw new UnauthorizedDomainError(INVALID_CREDENTIALS);

    if (organizationId) {
      // Not a 403: telling the caller that the organization exists but is not theirs would
      // leak the tenant directory to anyone holding a single valid credential.
      if (!memberships.some((membership) => membership.organizationId === organizationId)) {
        throw new UnauthorizedDomainError(INVALID_CREDENTIALS);
      }
    } else if (memberships.length > 1) {
      return {
        outcome: 'ORGANIZATION_SELECTION_REQUIRED',
        organizations: memberships.map(toMembershipContract),
      };
    }

    const resolvedOrganizationId = organizationId ?? memberships[0]!.organizationId;
    await this.database.runSystem(resolvedOrganizationId, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    );
    const session = await this.sessions.issue(
      user.id,
      user.tokenVersion,
      resolvedOrganizationId,
      metadata,
    );
    return { outcome: 'AUTHENTICATED', session };
  }

  /**
   * Authenticates a platform operator. Platform sessions are deliberately not scoped to an
   * organization; platform authority is re-derived from `UserPlatformRole` by
   * `PlatformAuthGuard` on every protected request.
   */
  async platformLogin(
    email: string,
    password: string,
    metadata: SessionMetadata = {},
  ): Promise<IssuedSession> {
    const user = await this.database.runSystem(undefined, (tx) =>
      tx.user.findFirst({
        where: {
          emailNormalized: this.passwords.normalizeEmail(email),
          platformRoleAssignments: {
            some: {
              revokedAt: null,
              role: { permissions: { some: { permission: { key: 'platform.admin' } } } },
            },
          },
        },
        select: { id: true, isActive: true, passwordHash: true, tokenVersion: true },
      }),
    );
    if (!user?.passwordHash) {
      await this.passwords.verifyDecoy(password);
      throw new UnauthorizedDomainError(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verifyPassword(user.passwordHash, password)) || !user.isActive) {
      throw new UnauthorizedDomainError(INVALID_CREDENTIALS);
    }
    await this.database.runSystem(undefined, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    );
    return this.sessions.issue(user.id, user.tokenVersion, undefined, metadata);
  }

  refresh(refreshToken: string, metadata: SessionMetadata = {}): Promise<IssuedSession> {
    return this.sessions.rotate(refreshToken, metadata);
  }

  logout(sessionId: string): Promise<void> {
    return this.sessions.revoke(sessionId, REVOCATION.logout);
  }

  /**
   * Pre-authentication lookup. Runs on the system role because no tenant context exists yet;
   * it is keyed solely on the normalized email, and nothing is returned to the caller until
   * the password has been verified.
   */
  private findByEmail(email: string) {
    return this.database.runSystem(undefined, (tx) =>
      tx.user.findUnique({
        where: { emailNormalized: this.passwords.normalizeEmail(email) },
        select: {
          id: true,
          isActive: true,
          passwordHash: true,
          tokenVersion: true,
          memberships: {
            select: {
              organizationId: true,
              status: true,
              organization: { select: { name: true, slug: true, status: true } },
            },
          },
        },
      }),
    );
  }
}

function toMembershipContract(membership: {
  organizationId: string;
  organization: { name: string; slug: string; status: string };
}): OrganizationMembership {
  return {
    organizationId: membership.organizationId,
    name: membership.organization.name,
    slug: membership.organization.slug,
    status: membership.organization.status as OrganizationMembership['status'],
  };
}
