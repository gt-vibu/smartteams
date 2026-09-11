import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { PasswordService } from '../auth/auth.passwords';
import type { AuditContext } from '../audit/audit.service';
import { seedLeaveDefaults, seedStandardRoles } from './organization-roles';
import { branchDto, toDto } from './organization-shared';

/**
 * Standing a new tenant up, and listing the tenants the platform knows about.
 *
 * The heaviest single path in the product: it creates the organization, its first branch, the
 * four seeded roles and the administrator who will use them, in one transaction. Nothing else in
 * this module runs before a tenant exists, which is why it is now on its own.
 */
@Injectable()
export class OrganizationOnboardingService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  async listPlatform(userId: string) {
    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      // Required: `runPlatform` refuses any RLS bypass that is not attributable to an operator
      // and a stated purpose. Omitting it makes the whole listing fail closed with a 403.
      reason: 'Platform tenant directory listing',
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };

    return this.database.runPlatform(context, async (tx) => {
      const organizations = await tx.organization.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          settings: true,
          users: {
            where: { status: 'ACTIVE' },
            // Deterministic: the primary administrator is the founding member, so the oldest
            // active membership wins. Without an explicit order the row is whatever Postgres
            // returns first, which would show an arbitrary employee as "Primary Admin" as soon
            // as a tenant has more than one member.
            orderBy: { joinedAt: 'asc' },
            take: 1,
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  lastLoginAt: true,
                },
              },
            },
          },
          _count: {
            select: {
              branches: true,
              // Counts must match the "Active" figure the console renders beside them; an
              // unfiltered count also includes REMOVED and SUSPENDED memberships.
              users: { where: { status: 'ACTIVE' } },
            },
          },
        },
      });

      return organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        source: org.source,
        status: org.status,
        timezone: org.timezone,
        currencyCode: org.currencyCode,
        locale: org.locale,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        deactivatedAt: org.deactivatedAt?.toISOString() ?? null,
        branchCount: org._count.branches,
        userCount: org._count.users,
        adminUser: org.users[0]?.user ?? null,
      }));
    });
  }

  async onboardPlatform(
    userId: string,
    input: {
      name: string;
      slug: string;
      timezone: string;
      currencyCode: string;
      adminEmail: string;
      adminDisplayName: string;
      reason?: string;
    },
  ) {
    const reason = input.reason || 'Super Admin company onboarding';
    const emailNormalized = input.adminEmail.trim().toLowerCase();

    // Generate secure 16-character temporary password with complexity
    const randomChars = randomBytes(9).toString('base64url');
    const temporaryPassword = `ST!${randomChars}9aA`;
    const passwordHash = await this.passwords.hashPassword(temporaryPassword);

    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      reason,
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };

    const result = await this.database.runPlatform(context, async (tx) => {
      // 1. Create Organization
      const organization = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          source: 'NATIVE',
          timezone: input.timezone,
          currencyCode: input.currencyCode.toUpperCase(),
          settings: { create: {} },
        },
      });

      // 2. Create Default Primary Branch
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: 'Headquarters',
          code: 'HQ',
          source: 'NATIVE',
        },
      });

      // 3. Create or find User
      const existingUser = await tx.user.findUnique({
        where: { emailNormalized },
      });

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              displayName: input.adminDisplayName.trim(),
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              email: input.adminEmail.trim(),
              emailNormalized,
              displayName: input.adminDisplayName.trim(),
              passwordHash,
              identityType: 'NATIVE',
            },
          });

      // 4. Create UserOrganization membership
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: organization.id },
        },
        create: {
          userId: user.id,
          organizationId: organization.id,
          status: 'ACTIVE',
          source: 'NATIVE',
        },
        update: {
          status: 'ACTIVE',
          removedAt: null,
        },
      });

      // 5. Create canonical ORG_ADMIN role if not existing in this org
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          code: 'ORG_ADMIN',
          name: 'Organization Admin',
          description: 'Full administrative access to the organization workspace',
          scope: 'ORGANIZATION',
          isSystem: true,
        },
      });

      // 6. Link wildcard permission to ORG_ADMIN
      const wildcardPermission = await tx.permission.upsert({
        where: { key: '*' },
        create: { key: '*', description: 'Administrator wildcard permission' },
        update: {},
      });

      await tx.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: wildcardPermission.id,
        },
      });

      // 7. Assign ORG_ADMIN role to user
      await tx.userRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: role.id,
          assignmentSource: 'NATIVE',
        },
      });

      // 7b. The three non-administrator roles, shared with self-service registration so a
      // tenant created either way ends up with the same set. ORG_ADMIN above holds the wildcard,
      // which is right for the bootstrap administrator and wrong for everyone else.
      await seedStandardRoles(tx, organization.id);
      // Leave types, their branch assignments and a default approval policy — without these a
      // new tenant's Leave screen is a dead end no matter which path created the tenant.
      await seedLeaveDefaults(tx, organization.id, branch.id, role.id);

      // 8. Record audit log
      await this.audit.record(
        { ...context, organizationId: organization.id },
        {
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: 'ORGANIZATION_CREATED',
          afterState: jsonSnapshot({
            organization,
            adminUserId: user.id,
            branchId: branch.id,
          }),
          reason,
        },
        tx,
      );

      return {
        organization: toDto(organization),
        adminUser: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        branch: branchDto(branch),
      };
    });

    return {
      ...result,
      temporaryPassword,
    };
  }

  async createPlatform(
    userId: string,
    input: {
      name: string;
      slug: string;
      timezone: string;
      currencyCode: string;
      source?: 'NATIVE' | 'BLIZBOOKS';
      externalId?: string;
      reason: string;
    },
  ) {
    const source = input.source ?? 'NATIVE';
    if ((source === 'BLIZBOOKS') !== Boolean(input.externalId?.trim()))
      throw new ConflictError(
        'A BLIZBOOKS organization requires an externalId and a NATIVE organization must not have one',
      );
    const context = {
      accessMode: 'PLATFORM' as const,
      actor: { type: 'PLATFORM_OPERATOR' as const, userId },
      correlationId: randomUUID(),
      requestId: randomUUID(),
      permissions: new Set(['*']),
      reason: input.reason,
    } satisfies Omit<AuditContext, 'organizationId'> & { organizationId?: string };
    const organization = await this.database.runPlatform(context, async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          source,
          externalId: input.externalId?.trim(),
          timezone: input.timezone,
          currencyCode: input.currencyCode.toUpperCase(),
          settings: { create: {} },
        },
      });
      await this.audit.record(
        { ...context, organizationId: created.id },
        {
          entityType: 'ORGANIZATION',
          entityId: created.id,
          action: 'ORGANIZATION_CREATED',
          afterState: jsonSnapshot(created),
          reason: input.reason,
        },
        tx,
      );
      return created;
    });
    return toDto(organization);
  }
}
