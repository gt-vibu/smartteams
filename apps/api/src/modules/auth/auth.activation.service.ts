import { Injectable } from '@nestjs/common';
import type { AccessCodePreview } from '@smarteam/contracts';
import { ConflictError, UnauthorizedDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { PasswordService } from './auth.passwords';
import {
  AuthSessionService,
  type IssuedSession,
  type SessionMetadata,
} from './auth.session.service';
import { AuthTokenService } from './auth.tokens';

export type ActivateInput = {
  code: string;
  email: string;
  password: string;
};

/**
 * Employee self-activation against a one-time access code.
 *
 * Both entry points here are unauthenticated by necessity — the whole point is that the employee
 * has no account yet — so they run under `runSystem`: a code cannot be found at all without a
 * tenant context, and the code itself is what establishes which tenant this is. Everything the
 * code is allowed to do was fixed when an administrator issued it.
 *
 * Neither method distinguishes "no such code" from "expired" or "already used" in what it throws.
 * A caller who can tell those apart can probe which codes exist.
 */
@Injectable()
export class AuthActivationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly tokens: AuthTokenService,
  ) {}

  /**
   * Confirms a code and reports who it belongs to, so the employee can see they are joining the
   * right organization before choosing a password. Reveals a name, never an email or a role.
   */
  async preview(code: string): Promise<AccessCodePreview> {
    const codeHash = this.tokens.hashAccessCode(code);
    return this.database.runSystem(undefined, async (tx) => {
      const record = await tx.employeeAccessCode.findUnique({
        where: { codeHash },
        select: {
          expiresAt: true,
          activatedAt: true,
          revokedAt: true,
          employee: {
            select: { firstName: true, lastName: true, employeeNumber: true, userId: true },
          },
          organization: { select: { name: true } },
        },
      });
      if (!usable(record)) throw invalidCode();
      return {
        organizationName: record.organization.name,
        employeeName: `${record.employee.firstName} ${record.employee.lastName}`.trim(),
        employeeNumber: record.employee.employeeNumber,
      };
    });
  }

  /**
   * Redeems the code: creates the login, attaches it to the employee record, and signs them in.
   *
   * The whole thing is one transaction claimed under a status guard, so two people racing the
   * same code produce one account, not two.
   */
  async activate(input: ActivateInput, metadata: SessionMetadata = {}): Promise<IssuedSession> {
    const codeHash = this.tokens.hashAccessCode(input.code);
    const emailNormalized = this.passwords.normalizeEmail(input.email);
    const passwordHash = await this.passwords.hashPassword(input.password);

    const result = await this.database.runSystem(undefined, async (tx) => {
      const record = await tx.employeeAccessCode.findUnique({
        where: { codeHash },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        },
      });
      if (!usable(record)) throw invalidCode();

      // Claim first, under the same conditions that made it usable. A second request racing this
      // one finds nothing left to claim and is rejected.
      const claimed = await tx.employeeAccessCode.updateMany({
        where: { id: record.id, activatedAt: null, revokedAt: null },
        data: { activatedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidCode();

      // An address that already has a login is refused outright. Nobody proved they own this
      // address — the code proves they are the employee, not that they hold the mailbox — so
      // adopting an existing account here would hand it to whoever holds the code.
      const existing = await tx.user.findUnique({
        where: { emailNormalized },
        select: { id: true },
      });
      if (existing)
        throw new ConflictError(
          'An account already exists for that email address. Sign in with it instead.',
        );

      const user = await tx.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized,
          displayName: `${record.employee.firstName} ${record.employee.lastName}`.trim(),
          passwordHash,
          identityType: 'NATIVE',
        },
      });
      await tx.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: record.organizationId,
          status: 'ACTIVE',
          source: 'NATIVE',
        },
      });
      await tx.employee.update({
        where: { id: record.employeeId },
        data: { userId: user.id, version: { increment: 1 } },
      });
      await grantRoles(tx, user.id, record.organizationId, record.roleIds);
      await tx.employeeAccessCode.update({
        where: { id: record.id },
        data: { activatedByUserId: user.id },
      });

      return {
        userId: user.id,
        tokenVersion: user.tokenVersion,
        organizationId: record.organizationId,
      };
    });

    return this.sessions.issue(result.userId, result.tokenVersion, result.organizationId, metadata);
  }
}

/** Usable means: exists, not spent, not withdrawn, not expired, and not already a login. */
function usable<
  T extends {
    expiresAt: Date;
    activatedAt: Date | null;
    revokedAt: Date | null;
    employee: { userId: string | null };
  },
>(record: T | null): record is T {
  if (!record) return false;
  if (record.activatedAt || record.revokedAt) return false;
  if (record.expiresAt <= new Date()) return false;
  return record.employee.userId === null;
}

/**
 * Grants the employee baseline plus whatever the issuing administrator recorded on the code.
 *
 * `EMPLOYEE` is always included: an account that activates into no roles at all can sign in and
 * see nothing, which reads as a broken product rather than a locked-down one. The recorded roles
 * were already checked against the issuer's own permissions when the code was created.
 */
async function grantRoles(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string,
  roleIds: readonly string[],
) {
  const baseline =
    (await tx.role.findFirst({
      where: { organizationId, code: 'EMPLOYEE' },
      select: { id: true },
    })) ??
    (await tx.role.create({
      data: {
        organizationId,
        code: 'EMPLOYEE',
        name: 'Employee',
        scope: 'ORGANIZATION',
        isSystem: true,
      },
      select: { id: true },
    }));

  // Re-read the recorded roles rather than trusting the stored ids: a role can be deleted between
  // issuing a code and redeeming it, and the tenant filter keeps a stale id from another
  // organization from resolving.
  const recorded = await tx.role.findMany({
    where: { id: { in: [...roleIds] }, organizationId },
    select: { id: true },
  });

  const wanted = new Set([baseline.id, ...recorded.map((role) => role.id)]);
  for (const roleId of wanted) {
    const held = await tx.userRole.findFirst({
      where: { userId, organizationId, roleId, endsAt: null },
      select: { id: true },
    });
    if (held) continue;
    await tx.userRole.create({
      data: { userId, organizationId, roleId, assignmentSource: 'NATIVE' },
    });
  }
}

function invalidCode() {
  return new UnauthorizedDomainError('That access code is invalid, expired, or already used');
}
