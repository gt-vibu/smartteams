import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  organizationId?: string;
  userId: string;
};

type TokenPayload = { sub: string; sid: string; tv: number; organizationId?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly database: TenantDatabaseService,
  ) {}

  async hashPassword(password: string) {
    return argon2.hash(password, {
      memoryCost: this.config.get<number>('PASSWORD_HASH_MEMORY_COST', 19_456),
      type: argon2.argon2id,
    });
  }

  async verifyPassword(hash: string, password: string) {
    return argon2.verify(hash, password);
  }

  async register(input: {
    organizationName: string;
    timezone: string;
    currencyCode: string;
    email: string;
    displayName: string;
    password: string;
  }) {
    const emailNormalized = this.normalizeEmail(input.email);
    const passwordHash = await this.hashPassword(input.password);
    const result = await this.database.runSystem(undefined, async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized,
          displayName: input.displayName.trim(),
          passwordHash,
          identityType: 'NATIVE',
        },
      });
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug: this.slugify(input.organizationName),
          source: 'NATIVE',
          timezone: input.timezone,
          currencyCode: input.currencyCode.toUpperCase(),
          settings: { create: {} },
        },
      });
      await tx.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          status: 'ACTIVE',
          source: 'NATIVE',
        },
      });
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          code: 'ORG_ADMIN',
          name: 'Organization Admin',
          scope: 'ORGANIZATION',
          isSystem: true,
        },
      });
      const wildcard = await tx.permission.create({
        data: { key: '*', description: 'Organization administrator wildcard permission' },
      });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: wildcard.id } });
      await tx.userRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: role.id,
          assignmentSource: 'NATIVE',
        },
      });
      return { userId: user.id, tokenVersion: user.tokenVersion, organizationId: organization.id };
    });
    return this.issueTokens(result.userId, result.tokenVersion, result.organizationId);
  }

  async login(
    email: string,
    password: string,
    organizationId: string,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'SYSTEM' },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.user.findFirst({
          where: {
            emailNormalized: this.normalizeEmail(email),
            isActive: true,
            memberships: { some: { organizationId, status: 'ACTIVE' } },
          },
        }),
    );
    if (!user?.passwordHash || !(await this.verifyPassword(user.passwordHash, password)))
      throw new UnauthorizedDomainError('Invalid email or password');
    await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'SYSTEM' },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      (tx) => tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    );
    return this.issueTokens(user.id, user.tokenVersion, organizationId, metadata);
  }

  async platformLogin(
    email: string,
    password: string,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.database.runSystem(undefined, (tx) =>
      tx.user.findFirst({
        where: {
          emailNormalized: this.normalizeEmail(email),
          isActive: true,
          platformRoleAssignments: {
            some: {
              revokedAt: null,
              role: { permissions: { some: { permission: { key: 'platform.admin' } } } },
            },
          },
        },
      }),
    );
    if (!user?.passwordHash || !(await this.verifyPassword(user.passwordHash, password)))
      throw new UnauthorizedDomainError('Invalid email or password');
    await this.database.runSystem(undefined, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    );
    return this.issueTokens(user.id, user.tokenVersion, undefined, metadata);
  }

  async refresh(refreshToken: string) {
    const session = await this.database.runSystem(undefined, (tx) =>
      tx.authSession.findUnique({
        where: { refreshTokenHash: this.hashOpaqueToken(refreshToken) },
        include: { user: true },
      }),
    );
    if (
      !session ||
      session.status !== 'ACTIVE' ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    )
      throw new UnauthorizedDomainError('Refresh token is invalid or expired');
    if (session.organizationId) {
      await this.database.run(
        {
          organizationId: session.organizationId,
          accessMode: 'NATIVE',
          actor: { type: 'USER', userId: session.userId },
          correlationId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          permissions: new Set(),
        },
        (tx) =>
          tx.authSession.update({
            where: { id: session.id },
            data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'ROTATED' },
          }),
      );
    } else {
      await this.database.runSystem(undefined, (tx) =>
        tx.authSession.update({
          where: { id: session.id },
          data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'ROTATED' },
        }),
      );
    }
    return this.issueTokens(
      session.userId,
      session.user.tokenVersion,
      session.organizationId ?? undefined,
    );
  }

  async logout(sessionId: string) {
    await this.database.runSystem(undefined, (tx) =>
      tx.authSession.updateMany({
        where: { id: sessionId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'USER_LOGOUT' },
      }),
    );
  }

  async revokeAllSessions(userId: string, reason: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await tx.authSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      });
      return;
    }
    await this.database.runSystem(undefined, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await tx.authSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      });
    });
  }

  async requestPasswordReset(email: string, organizationId: string) {
    const user = await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'SYSTEM' },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.user.findFirst({
          where: {
            emailNormalized: this.normalizeEmail(email),
            memberships: { some: { organizationId, status: 'ACTIVE' } },
            isActive: true,
          },
        }),
    );
    if (!user) return { accepted: true };
    const token = randomBytes(32).toString('base64url');
    await this.database.runSystem(undefined, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    );
    return {
      accepted: true,
      delivery: 'configured',
      developmentToken: this.config.get('NODE_ENV') === 'development' ? token : undefined,
    };
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.database.runSystem(undefined, (tx) =>
      tx.passwordResetToken.findUnique({ where: { tokenHash: this.hashOpaqueToken(token) } }),
    );
    if (!reset || reset.usedAt || reset.revokedAt || reset.expiresAt <= new Date())
      throw new UnauthorizedDomainError('Password reset token is invalid or expired');
    const passwordHash = await this.hashPassword(password);
    await this.database.runSystem(undefined, async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedDomainError('Password reset token is invalid or expired');
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

  async acceptInvitation(token: string, displayName: string, password: string) {
    const invitation = await this.database.runSystem(undefined, (tx) =>
      tx.userInvitation.findUnique({ where: { tokenHash: this.hashOpaqueToken(token) } }),
    );
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new UnauthorizedDomainError('Invitation is invalid or expired');
    const result = await this.database.runSystem(undefined, async (tx) => {
      const existing = await tx.user.findUnique({
        where: { emailNormalized: invitation.emailNormalized },
      });
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              displayName: displayName.trim(),
              passwordHash: await this.hashPassword(password),
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              email: invitation.emailNormalized,
              emailNormalized: invitation.emailNormalized,
              displayName: displayName.trim(),
              passwordHash: await this.hashPassword(password),
              identityType: 'NATIVE',
            },
          });
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: invitation.organizationId },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          status: 'ACTIVE',
          source: 'NATIVE',
        },
        update: { status: 'ACTIVE', removedAt: null },
      });
      const role =
        (await tx.role.findFirst({
          where: { organizationId: invitation.organizationId, code: 'EMPLOYEE' },
        })) ??
        (await tx.role.create({
          data: {
            organizationId: invitation.organizationId,
            code: 'EMPLOYEE',
            name: 'Employee',
            scope: 'ORGANIZATION',
            isSystem: true,
          },
        }));
      const assignment = await tx.userRole.findFirst({
        where: {
          userId: user.id,
          organizationId: invitation.organizationId,
          roleId: role.id,
          endsAt: null,
        },
      });
      if (!assignment)
        await tx.userRole.create({
          data: {
            userId: user.id,
            organizationId: invitation.organizationId,
            roleId: role.id,
            assignmentSource: 'NATIVE',
          },
        });
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      return {
        userId: user.id,
        tokenVersion: user.tokenVersion,
        organizationId: invitation.organizationId,
      };
    });
    return this.issueTokens(result.userId, result.tokenVersion, result.organizationId);
  }

  async getUser(userId: string) {
    const user = await this.database.runSystem(undefined, (tx) =>
      tx.user.findUnique({ where: { id: userId }, include: { memberships: true, employee: true } }),
    );
    if (!user || !user.isActive) throw new UnauthorizedDomainError();
    return user;
  }

  async issueTokens(
    userId: string,
    tokenVersion: number,
    organizationId?: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<AuthTokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const createSession = (tx: Prisma.TransactionClient) =>
      tx.authSession.create({
        data: {
          userId,
          organizationId,
          refreshTokenHash: this.hashOpaqueToken(refreshToken),
          expiresAt: new Date(
            Date.now() + this.config.get<number>('JWT_REFRESH_TOKEN_TTL_SECONDS', 2_592_000) * 1000,
          ),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    const session = organizationId
      ? await this.database.run(
          {
            organizationId,
            accessMode: 'NATIVE',
            actor: { type: 'USER', userId },
            correlationId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            permissions: new Set(),
          },
          createSession,
        )
      : await this.database.runSystem(undefined, createSession);
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      sid: session.id,
      tv: tokenVersion,
      organizationId,
    } satisfies TokenPayload);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS', 900),
      organizationId,
      userId,
    };
  }

  hashOpaqueToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private slugify(value: string) {
    const slug =
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `org-${randomUUID().slice(0, 8)}`;
    return `${slug}-${randomUUID().slice(0, 8)}`;
  }
}
