import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { PasswordService } from '../auth/auth.passwords';
import { RbacService } from '../rbac/rbac.service';

/**
 * Organization membership.
 *
 * Until now the only way a person could get a login for a tenant was to be its bootstrap
 * administrator, created by the platform console during onboarding, or to be provisioned by
 * BlizBooks. `UserInvitation` rows could be *accepted* but nothing created one, and
 * `RbacAdminService.assign` refuses a user who is not already an active member — so a native
 * organization had no way to add its second person. That is what made employee onboarding
 * impossible to finish natively.
 *
 * This is the smallest capability that closes it: create or attach a user, make them an active
 * member, and give them roles. It deliberately does not become an invitation-email system; the
 * temporary password is returned once, exactly as tenant onboarding already does.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Members with the roles currently assigned to them.
   *
   * A People view cannot say "Employee · Payroll Admin" from just this list — it needs the role
   * every member actually holds, which used to mean a second round trip per row. `UserRole` is
   * fetched once for the whole page and grouped in memory instead, so the response stays a single
   * query regardless of how many members are on it.
   */
  async list(context: DomainContext) {
    requirePermission(context, 'members.read');
    return this.database.run(context, async (tx) => {
      const now = new Date();
      const [memberships, assignments] = await Promise.all([
        tx.userOrganization.findMany({
          where: { organizationId: context.organizationId, status: 'ACTIVE' },
          include: {
            user: { select: { id: true, email: true, displayName: true, isActive: true } },
          },
          orderBy: { joinedAt: 'asc' },
          take: 200,
        }),
        tx.userRole.findMany({
          where: {
            organizationId: context.organizationId,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: {
            id: true,
            userId: true,
            branchId: true,
            role: { select: { id: true, code: true, name: true, scope: true } },
          },
        }),
      ]);
      const rolesByUser = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        const list = rolesByUser.get(assignment.userId) ?? [];
        list.push(assignment);
        rolesByUser.set(assignment.userId, list);
      }
      return memberships.map((membership) => ({
        userId: membership.user.id,
        email: membership.user.email,
        displayName: membership.user.displayName,
        isActive: membership.user.isActive,
        joinedAt: membership.joinedAt,
        roles: (rolesByUser.get(membership.user.id) ?? []).map((assignment) => ({
          userRoleId: assignment.id,
          id: assignment.role.id,
          code: assignment.role.code,
          name: assignment.role.name,
          scope: assignment.role.scope,
          branchId: assignment.branchId,
        })),
      }));
    });
  }

  /**
   * Adds a person to this organization.
   *
   * An email already known to Smarteam is attached rather than duplicated — `emailNormalized` is
   * globally unique, so creating would fail, and silently minting a second identity for the same
   * human is worse than failing anyway. An existing user keeps their password: this route never
   * resets one, so no temporary password comes back for them.
   */
  async create(
    context: DomainContext,
    input: { email: string; displayName: string; roleIds: string[]; reason: string },
  ) {
    requirePermission(context, 'members.write');
    requireReason(context, 'A reason is required to add a member');

    const emailNormalized = this.passwords.normalizeEmail(input.email);
    // Generated before the transaction so the hash cost is not paid while holding it open.
    const temporaryPassword = `ST!${randomBytes(9).toString('base64url')}9aA`;
    const passwordHash = await this.passwords.hashPassword(temporaryPassword);

    return this.database.run(context, async (tx) => {
      const roles = await tx.role.findMany({
        where: { id: { in: input.roleIds }, organizationId: context.organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (roles.length !== input.roleIds.length) throw new NotFoundError('Role');
      if (roles.length === 0) throw new ConflictError('A member needs at least one role');
      // Adding a member with roles is a grant, same as `RbacAdminService.assign` — a caller with
      // only `members.write` (HR_ADMIN, not the wildcard) must not be able to onboard a puppet
      // account carrying ORG_ADMIN by naming its role id in this call instead of that one.
      this.rbac.assertGrantable(
        context,
        roles.flatMap((role) => role.permissions.map((entry) => entry.permission.key)),
      );

      const existing = await tx.user.findUnique({ where: { emailNormalized } });
      if (existing) {
        const membership = await tx.userOrganization.findFirst({
          where: { userId: existing.id, organizationId: context.organizationId },
        });
        if (membership?.status === 'ACTIVE')
          throw new ConflictError('That person is already a member of this organization');
      }

      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: input.email.trim(),
            emailNormalized,
            displayName: input.displayName.trim(),
            passwordHash,
            identityType: 'NATIVE',
          },
        }));

      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: context.organizationId },
        },
        create: {
          userId: user.id,
          organizationId: context.organizationId,
          status: 'ACTIVE',
          // The membership is created natively even when the organization itself came from
          // BlizBooks: this route is the native product adding a person, not a federated sync.
          source: 'NATIVE',
        },
        update: { status: 'ACTIVE', removedAt: null },
      });

      for (const role of roles) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            organizationId: context.organizationId,
            roleId: role.id,
            assignmentSource: 'NATIVE',
            grantedByUserId: context.actor.userId,
          },
        });
      }

      await this.audit.record(
        context,
        {
          entityType: 'USER_ORGANIZATION',
          entityId: user.id,
          action: 'MEMBER_ADDED',
          afterState: jsonSnapshot({
            userId: user.id,
            email: user.email,
            roleCodes: roles.map((role) => role.code),
            reusedExistingIdentity: Boolean(existing),
          }),
        },
        tx,
      );

      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        roleIds: roles.map((role) => role.id),
        /**
         * Present only for an identity created by this call. An existing user keeps the password
         * they already have, and this route is not a password reset.
         */
        temporaryPassword: existing ? null : temporaryPassword,
      };
    });
  }
}
