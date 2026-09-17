import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { EmployeeAccessCodeState, EmployeeAccessCodeStatus } from '@smarteam/contracts';
import type { DomainContext } from '../../common/context/domain-context';
import { requirePermission } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { AuthTokenService } from '../auth/auth.tokens';
import { RbacService } from '../rbac/rbac.service';

/** Digits and letters with the ambiguous ones removed, so a code survives being read aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_SIZE = 4;
const TTL_HOURS = 48;

/**
 * One-time codes that let an employee activate their own Smarteam login.
 *
 * The alternative — an administrator setting a password and passing it on — makes the
 * administrator handle a credential that should only ever be the employee's. Here the
 * administrator hands over a bootstrap code and the employee chooses their own email and
 * password against it, so no permanent credential is ever known to two people.
 *
 * The plaintext code exists only in the response that creates it. Everything stored is a digest,
 * so this service cannot show an administrator a code they have lost — only issue a new one,
 * which withdraws the old.
 */
@Injectable()
export class EmployeeAccessCodeService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokenService,
    private readonly rbac: RbacService,
  ) {}

  /** What an administrator sees on the employee's record: whether they can sign in yet. */
  async status(context: DomainContext, employeeId: string): Promise<EmployeeAccessCodeStatus> {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: { id: true, userId: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (employee.userId) return { state: 'ACTIVE', expiresAt: null, issuedAt: null };

      const pending = await tx.employeeAccessCode.findFirst({
        where: {
          employeeId,
          organizationId: context.organizationId,
          activatedAt: null,
          revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { expiresAt: true, createdAt: true },
      });
      if (!pending) return { state: 'NO_ACCOUNT', expiresAt: null, issuedAt: null };

      const state: EmployeeAccessCodeState =
        pending.expiresAt <= new Date() ? 'CODE_EXPIRED' : 'CODE_ISSUED';
      return {
        state,
        expiresAt: pending.expiresAt.toISOString(),
        issuedAt: pending.createdAt.toISOString(),
      };
    });
  }

  /**
   * Issues a code, withdrawing any code the employee already holds.
   *
   * `roleIds` are the roles the employee will hold once they activate. They are checked against
   * the issuer's own permissions here, at issue time, by the same `assertGrantable` that guards
   * every other grant — an administrator cannot seed an account with authority they do not have
   * themselves, and so a code can never be a privilege-escalation route.
   */
  async issue(
    context: DomainContext,
    employeeId: string,
    roleIds: readonly string[],
  ): Promise<{ code: string; expiresAt: string }> {
    requirePermission(context, 'employees.write');
    const actorId = context.actor.userId;
    if (!actorId) throw new ConflictError('Only a signed-in user can issue an access code');

    const code = generateCode();
    const codeHash = this.tokens.hashAccessCode(code);
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

    await this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: { id: true, userId: true, employeeNumber: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (employee.userId)
        throw new ConflictError('This employee already has a login and does not need a code');

      const roles = await tx.role.findMany({
        where: { id: { in: [...roleIds] }, organizationId: context.organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (roles.length !== roleIds.length) throw new NotFoundError('Role');
      this.rbac.assertGrantable(
        context,
        roles.flatMap((role) => role.permissions.map((entry) => entry.permission.key)),
      );

      // Withdraw whatever is outstanding before inserting, or the partial unique index rejects
      // the new row. Reissuing is the only way to replace a code an employee has lost, so it has
      // to work every time rather than requiring an explicit revoke first.
      await tx.employeeAccessCode.updateMany({
        where: {
          employeeId,
          organizationId: context.organizationId,
          activatedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      const issued = await tx.employeeAccessCode.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          codeHash,
          roleIds: [...roleIds],
          createdByUserId: actorId,
          expiresAt,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_ACCESS_CODE',
          entityId: issued.id,
          action: 'EMPLOYEE_ACCESS_CODE_ISSUED',
          // Deliberately no code and no digest: an audit reader must not be able to reconstruct
          // or confirm a credential from the trail.
          afterState: {
            employeeId,
            employeeNumber: employee.employeeNumber,
            roleIds: [...roleIds],
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
    });

    return { code, expiresAt: expiresAt.toISOString() };
  }

  /** Withdraws the outstanding code, so a code shared with the wrong person stops working. */
  async revoke(context: DomainContext, employeeId: string): Promise<void> {
    requirePermission(context, 'employees.write');
    await this.database.run(context, async (tx) => {
      const revoked = await tx.employeeAccessCode.updateMany({
        where: {
          employeeId,
          organizationId: context.organizationId,
          activatedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) throw new NotFoundError('Pending access code');
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_ACCESS_CODE',
          entityId: employeeId,
          action: 'EMPLOYEE_ACCESS_CODE_REVOKED',
          afterState: { employeeId },
        },
        tx,
      );
    });
  }
}

/**
 * A code in the shape `A1B2-C3D4-E5F6`.
 *
 * `randomInt` is the rejection-sampling CSPRNG helper, not `Math.random` and not a modulo of raw
 * bytes: a 32-character alphabet does not divide 256 evenly, so folding bytes would bias the
 * result and shrink the space an attacker has to search. Sixty bits of entropy across a
 * 48-hour window, behind the authentication rate limiter, is well beyond guessing range.
 */
function generateCode(): string {
  const groups: string[] = [];
  for (let group = 0; group < GROUPS; group += 1) {
    let value = '';
    for (let index = 0; index < GROUP_SIZE; index += 1) {
      value += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(value);
  }
  return groups.join('-');
}
