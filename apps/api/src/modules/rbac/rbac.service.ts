import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { ForbiddenDomainError } from '../../common/errors/domain-error';

export type AuthorizationContext = {
  organizationId: string;
  userId: string;
  permissions: ReadonlySet<string>;
};

/** What a delegate may do on a colleague's behalf: decide requests, and nothing more. */
const DECISION_PERMISSIONS = [
  'leave.requests.decide',
  'timesheets.decide',
  'attendance.corrections.decide',
] as const;

/** The decision each kind of routed request needs. */
const DECISION_BY_DOMAIN: Record<string, (typeof DECISION_PERMISSIONS)[number]> = {
  LEAVE: 'leave.requests.decide',
  TIMESHEET: 'timesheets.decide',
  ATTENDANCE_CORRECTION: 'attendance.corrections.decide',
};

@Injectable()
export class RbacService {
  constructor(private readonly database: TenantDatabaseService) {}

  /**
   * `"*"` is the tenant-scoped administrator wildcard. It is only ever reached through the
   * permission set of a single organization, so it grants everything inside that tenant and
   * nothing in any other tenant or on the platform.
   */
  hasPermission(context: AuthorizationContext, permission: string) {
    return context.permissions.has(permission) || context.permissions.has('*');
  }

  /**
   * Resolves the effective permissions a user holds in one organization.
   *
   * Membership is verified first: role assignments are not self-sufficient, because removing a
   * user from an organization sets `UserOrganization.status` without necessarily closing every
   * `UserRole` row. Reading roles alone would let a removed member keep full authority.
   * Returning an empty set here is what makes every downstream `requirePermission` deny.
   */
  async loadOrganizationPermissions(userId: string, organizationId: string, branchId?: string) {
    const now = new Date();
    const assignments = await this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'USER', userId },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      async (tx) => {
        const membership = await tx.userOrganization.findFirst({
          where: {
            userId,
            organizationId,
            status: 'ACTIVE',
            user: { isActive: true },
            organization: { status: 'ACTIVE' },
          },
          select: { id: true },
        });
        if (!membership) return { own: [], delegated: [], routed: [] };
        // Someone covering a colleague's approvals may decide what that colleague could, for the
        // days of the handover. Only decision permissions travel; nothing else about the
        // colleague's access does, and each decision is still checked against its approval step.
        const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
        const delegators = (
          await tx.approvalDelegation.findMany({
            where: {
              organizationId,
              delegateUserId: userId,
              revokedAt: null,
              // Only once the person covering has accepted (an administrator's handover is accepted when made).
              acceptedAt: { not: null },
              declinedAt: null,
              startsOn: { lte: day },
              endsOn: { gte: day },
            },
            select: { delegatorUserId: true },
          })
        ).map((row) => row.delegatorUserId);
        const roles = (holders: string[]) =>
          tx.userRole.findMany({
            where: {
              userId: { in: holders },
              organizationId,
              startsAt: { lte: now },
              AND: [
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                ...(branchId ? [{ OR: [{ branchId: null }, { branchId }] }] : []),
              ],
            },
            select: {
              role: {
                select: { permissions: { select: { permission: { select: { key: true } } } } },
              },
            },
          });
        // Whoever a policy routes requests to may decide them, whatever their role: a reporting
        // manager with someone reporting to them, or a person named on a step. Each decision is
        // still checked against the step it is for, so this reaches only their own requests.
        const hasReports = Boolean(
          await tx.employee.findFirst({
            where: { organizationId, status: 'ACTIVE', manager: { is: { userId } } },
            select: { id: true },
          }),
        );
        const routedSteps = await tx.approvalPolicyStep.findMany({
          where: {
            organizationId,
            OR: [
              { approverUserId: userId },
              ...(hasReports ? [{ approverType: 'MANAGER' as const }] : []),
            ],
          },
          select: { approvalPolicy: { select: { domain: true } } },
        });
        return {
          own: await roles([userId]),
          delegated: delegators.length ? await roles(delegators) : [],
          routed: routedSteps.map((step) => step.approvalPolicy.domain as string),
        };
      },
    );
    const keys = (rows: typeof assignments.own) =>
      rows.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.key));
    const own = new Set(keys(assignments.own));
    const theirs = new Set(keys(assignments.delegated));
    for (const permission of DECISION_PERMISSIONS)
      if (theirs.has('*') || theirs.has(permission)) own.add(permission);
    for (const domain of assignments.routed) {
      const permission = DECISION_BY_DOMAIN[domain];
      if (permission) own.add(permission);
    }
    return own;
  }

  /**
   * Whether someone decides approvals as themselves rather than through a role: they have people
   * reporting to them, are named on an approval step, or are covering (or asked to cover) for a
   * colleague. Their own workspace offers Approvals only then; HR and administrators reach the
   * organization's approvals from their admin workspace.
   */
  async approvesInOwnRight(userId: string, organizationId: string) {
    const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    return this.database.run(
      {
        organizationId,
        accessMode: 'NATIVE',
        actor: { type: 'USER', userId },
        correlationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        permissions: new Set(),
      },
      async (tx) => {
        const [reports, named, cover] = await Promise.all([
          tx.employee.count({
            where: { organizationId, status: 'ACTIVE', manager: { is: { userId } } },
          }),
          tx.approvalPolicyStep.count({ where: { organizationId, approverUserId: userId } }),
          tx.approvalDelegation.count({
            where: {
              organizationId,
              delegateUserId: userId,
              revokedAt: null,
              declinedAt: null,
              endsOn: { gte: day },
            },
          }),
        ]);
        return reports + named + cover > 0;
      },
    );
  }

  /**
   * A caller may grant only the authority they already hold.
   *
   * Without this, any principal holding `rbac.write` or `members.write` — permissions HR_ADMIN
   * carries, not just the ORG_ADMIN wildcard — could create a role bundling the tenant wildcard,
   * or assign an existing wildcard role, and reach full administrative control with no privilege
   * higher than "manages people operations." Both `RbacAdminService` and `MembersService` call
   * this before writing a role or a role assignment.
   *
   * Wildcard holders pass unconditionally, which grants them nothing new: `hasPermission` already
   * treats `*` as satisfying every check, so an ORG_ADMIN could reach the same result one way or
   * another. What this closes is every other holder of `rbac.write`.
   */
  assertGrantable(
    context: { permissions: ReadonlySet<string> },
    permissionKeys: readonly string[],
  ) {
    if (context.permissions.has('*')) return;
    const ungranted = permissionKeys.filter((key) => !context.permissions.has(key));
    if (ungranted.length > 0)
      throw new ForbiddenDomainError(
        `Cannot grant a permission you do not hold: ${ungranted.join(', ')}`,
      );
  }

  async assertOrganizationPermission(
    userId: string,
    organizationId: string,
    permission: string,
    branchId?: string,
  ) {
    const permissions = await this.loadOrganizationPermissions(userId, organizationId, branchId);
    if (!this.hasPermission({ organizationId, userId, permissions }, permission))
      throw new ForbiddenDomainError(`Missing permission: ${permission}`);
    return permissions;
  }
}
