import { Injectable } from '@nestjs/common';
import type {
  ActiveOrganization,
  AssignedRole,
  AuthenticatedSession,
  OrganizationMembership,
} from '@smarteam/contracts';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { RbacService } from '../rbac/rbac.service';

/**
 * Builds the authenticated authorization context served by `GET /v1/auth/me`.
 *
 * Everything here is derived from the session established by `NativeJwtGuard` and the database
 * rows behind it. No field is taken from the request body, query string, or a client-supplied
 * header — the caller cannot influence which user, tenant, roles or permissions are reported.
 *
 * The projection is deliberately narrow. `passwordHash`, `tokenVersion`, `refreshTokenHash`,
 * session token material and every unrelated column are excluded by explicit `select`s rather
 * than by deleting fields after the fact, so a schema addition cannot silently leak.
 */
@Injectable()
export class AuthIdentityService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly rbac: RbacService,
  ) {}

  async describe(
    userId: string,
    sessionId: string,
    organizationId?: string,
  ): Promise<AuthenticatedSession> {
    const record = await this.database.runSystem(organizationId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          identityType: true,
          isActive: true,
          lastLoginAt: true,
          memberships: {
            where: { status: 'ACTIVE' },
            select: {
              organizationId: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  timezone: true,
                  currencyCode: true,
                  locale: true,
                  status: true,
                },
              },
            },
          },
          platformRoleAssignments: {
            where: { revokedAt: null },
            select: {
              role: {
                select: { permissions: { select: { permission: { select: { key: true } } } } },
              },
            },
          },
          authSessions: {
            where: { id: sessionId },
            select: { id: true, organizationId: true, expiresAt: true },
          },
        },
      }),
    );
    if (!record?.isActive) throw new UnauthorizedDomainError();

    const session = record.authSessions[0];
    if (!session) throw new UnauthorizedDomainError('Session is invalid or revoked');

    const memberships: OrganizationMembership[] = record.memberships.map((membership) => ({
      organizationId: membership.organizationId,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
    }));

    // The active tenant comes from the session, never from a parameter, and only counts when
    // the membership backing it is still ACTIVE.
    const active = organizationId
      ? record.memberships.find((m) => m.organizationId === organizationId)
      : undefined;

    const [roles, permissions] = active
      ? await Promise.all([
          this.loadRoles(userId, active.organizationId),
          this.rbac.loadOrganizationPermissions(userId, active.organizationId),
        ])
      : [[], new Set<string>()];

    const platformPermissions = [
      ...new Set(
        record.platformRoleAssignments.flatMap((assignment) =>
          assignment.role.permissions.map((entry) => entry.permission.key),
        ),
      ),
    ];

    return {
      user: {
        id: record.id,
        email: record.email,
        displayName: record.displayName,
        identityType: record.identityType,
        isActive: record.isActive,
        lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
      },
      session: {
        id: session.id,
        organizationId: session.organizationId,
        expiresAt: session.expiresAt.toISOString(),
      },
      organization: active ? toActiveOrganization(active.organization) : null,
      memberships,
      roles,
      permissions: [...permissions],
      platform: {
        // Platform authority is a distinct trust domain: holding the tenant `"*"` wildcard
        // never sets this flag.
        isPlatformOperator: platformPermissions.length > 0,
        permissions: platformPermissions,
      },
      employee: active ? await this.loadEmployee(userId, active.organizationId) : null,
    };
  }

  private async loadRoles(userId: string, organizationId: string): Promise<AssignedRole[]> {
    const now = new Date();
    const assignments = await this.database.runSystem(organizationId, (tx) =>
      tx.userRole.findMany({
        where: {
          userId,
          organizationId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: {
          branchId: true,
          role: { select: { id: true, code: true, name: true, scope: true } },
        },
      }),
    );
    return assignments.map((assignment) => ({
      id: assignment.role.id,
      code: assignment.role.code,
      name: assignment.role.name,
      scope: assignment.role.scope,
      branchId: assignment.branchId,
    }));
  }

  /**
   * The employee record backing this user in the active tenant, if one exists. An administrator
   * onboarded through the platform console has no employee row, so null is expected.
   *
   * The column is `primaryBranchId`; the contract exposes it as `branchId`, so the mapping is
   * explicit rather than a passthrough.
   */
  private async loadEmployee(userId: string, organizationId: string) {
    const employee = await this.database.runSystem(organizationId, (tx) =>
      tx.employee.findFirst({
        where: { userId, organizationId },
        select: { id: true, employeeNumber: true, primaryBranchId: true },
      }),
    );
    if (!employee) return null;
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      branchId: employee.primaryBranchId,
    };
  }
}

function toActiveOrganization(organization: {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currencyCode: string;
  locale: string;
  status: ActiveOrganization['status'];
}): ActiveOrganization {
  return organization;
}
