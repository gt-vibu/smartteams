import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { PasswordService } from './auth.passwords';
import {
  AuthSessionService,
  type IssuedSession,
  type SessionMetadata,
} from './auth.session.service';
import { AuthTokenService } from './auth.tokens';
import { seedLeaveDefaults, seedStandardRoles } from '../organizations/organization-roles';

export type RegisterInput = {
  organizationName: string;
  timezone: string;
  currencyCode: string;
  email: string;
  displayName: string;
  password: string;
};

/** Self-service tenant creation and invitation acceptance. */
@Injectable()
export class AuthRegistrationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(input: RegisterInput): Promise<IssuedSession> {
    const emailNormalized = this.passwords.normalizeEmail(input.email);
    const passwordHash = await this.passwords.hashPassword(input.password);
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
          slug: slugify(input.organizationName),
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
      // A default branch, as platform onboarding creates. Leave requests require the employee to
      // have one, so a tenant without any branch could never approve a day off — the request was
      // refused with "an employee branch is required" and there was no branch to assign.
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: 'Headquarters',
          code: 'HQ',
          source: 'NATIVE',
        },
      });
      const adminRoleId = await grantOrganizationAdmin(tx, user.id, organization.id);
      // The same three roles platform onboarding seeds. Without them a self-registered tenant had
      // only the wildcard role, so there was nothing to give a new joiner and the onboarding form
      // fell back to creating employees who could never sign in.
      await seedStandardRoles(tx, organization.id);
      await seedLeaveDefaults(tx, organization.id, branch.id, adminRoleId);
      return { userId: user.id, tokenVersion: user.tokenVersion, organizationId: organization.id };
    });
    return this.sessions.issue(result.userId, result.tokenVersion, result.organizationId);
  }

  async acceptInvitation(
    token: string,
    displayName: string,
    password: string,
    metadata: SessionMetadata = {},
  ): Promise<IssuedSession> {
    const tokenHash = this.tokens.hashOpaqueToken(token);
    const passwordHash = await this.passwords.hashPassword(password);
    const result = await this.database.runSystem(undefined, async (tx) => {
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash } });
      if (!invitation || invitation.revokedAt || invitation.expiresAt <= new Date()) {
        throw invalidInvitation();
      }
      // Claim the invitation first, under a status guard, so two concurrent requests cannot
      // both redeem the same token.
      const claimed = await tx.userInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidInvitation();

      const existing = await tx.user.findUnique({
        where: { emailNormalized: invitation.emailNormalized },
      });
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { displayName: displayName.trim(), passwordHash, isActive: true },
          })
        : await tx.user.create({
            data: {
              email: invitation.emailNormalized,
              emailNormalized: invitation.emailNormalized,
              displayName: displayName.trim(),
              passwordHash,
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
      await grantEmployeeRole(tx, user.id, invitation.organizationId);
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { acceptedByUserId: user.id },
      });
      return {
        userId: user.id,
        tokenVersion: user.tokenVersion,
        organizationId: invitation.organizationId,
      };
    });
    return this.sessions.issue(result.userId, result.tokenVersion, result.organizationId, metadata);
  }
}

/**
 * Grants the tenant-scoped `ORG_ADMIN` role.
 *
 * `Permission.key` is globally unique, so the `"*"` row is shared by every tenant and must be
 * upserted rather than created — creating it is what made the second self-service registration
 * fail with a unique-constraint violation. Its authority is scoped by the *role* that carries
 * it: `RbacService.loadOrganizationPermissions` only ever reads `UserRole` rows for a single
 * organization, so `"*"` grants everything inside that tenant and nothing outside it. It
 * confers no platform authority, which lives in the separate `PlatformPermission` table.
 */
async function grantOrganizationAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string,
): Promise<string> {
  const role = await tx.role.create({
    data: {
      organizationId,
      code: 'ORG_ADMIN',
      name: 'Organization Admin',
      description: 'Full administrative access to the organization workspace',
      scope: 'ORGANIZATION',
      isSystem: true,
    },
  });
  const wildcard = await tx.permission.upsert({
    where: { key: '*' },
    create: { key: '*', description: 'Organization administrator wildcard permission' },
    update: {},
  });
  await tx.rolePermission.create({ data: { roleId: role.id, permissionId: wildcard.id } });
  await tx.userRole.create({
    data: { userId, organizationId, roleId: role.id, assignmentSource: 'NATIVE' },
  });
  // Returned so the caller can route the default approval policy at this role.
  return role.id;
}

async function grantEmployeeRole(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string,
) {
  const role =
    (await tx.role.findFirst({ where: { organizationId, code: 'EMPLOYEE' } })) ??
    (await tx.role.create({
      data: {
        organizationId,
        code: 'EMPLOYEE',
        name: 'Employee',
        scope: 'ORGANIZATION',
        isSystem: true,
      },
    }));
  const assignment = await tx.userRole.findFirst({
    where: { userId, organizationId, roleId: role.id, endsAt: null },
  });
  if (assignment) return;
  await tx.userRole.create({
    data: { userId, organizationId, roleId: role.id, assignmentSource: 'NATIVE' },
  });
}

function invalidInvitation() {
  return new UnauthorizedDomainError('Invitation is invalid or expired');
}

function slugify(value: string) {
  const slug =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `org-${randomUUID().slice(0, 8)}`;
  return `${slug}-${randomUUID().slice(0, 8)}`;
}
