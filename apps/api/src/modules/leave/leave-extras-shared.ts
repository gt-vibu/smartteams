import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';
import { jsonSnapshot, type AuditService } from '../audit/audit.service';
import { provisionBalance } from './leave-balance-ops';
import { leavePeriod } from './leave-shared';

/** Helpers shared by comp-off and encashment. */

export const DAY_MS = 86_400_000;
export const dateOnly = (value: string | Date) =>
  new Date(
    `${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`,
  );
export const today = () => dateOnly(new Date());
export const has = (context: DomainContext, permission: string) =>
  context.permissions.has('*') || context.permissions.has(permission);

export function recordChange(
  audit: AuditService,
  context: DomainContext,
  tx: Prisma.TransactionClient,
  entityType: string,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  return audit.record(
    context,
    {
      entityType,
      entityId: id,
      action,
      ...(before ? { beforeState: jsonSnapshot(before) } : {}),
      afterState: jsonSnapshot(after),
    },
    tx,
  );
}

export async function maybeSelf(tx: Prisma.TransactionClient, context: DomainContext) {
  if (!context.actor.userId) return null;
  return tx.employee.findFirst({
    where: { organizationId: context.organizationId, userId: context.actor.userId },
    select: { id: true },
  });
}

export async function selfEmployee(tx: Prisma.TransactionClient, context: DomainContext) {
  const self = context.actor.userId
    ? await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          userId: context.actor.userId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          primaryBranchId: true,
          manager: { select: { userId: true } },
        },
      })
    : null;
  if (!self) throw new ConflictError('Only a current employee can do this.');
  return self;
}

export async function compOffType(tx: Prisma.TransactionClient, organizationId: string) {
  const type = await tx.leaveType.findFirst({
    where: { organizationId, isCompOff: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!type)
    throw new ConflictError('Comp-off is not set up. Ask HR to create a comp-off leave type.');
  return type;
}

/** This leave year's balance of a type, opened if the employee has none yet. */
export async function currentBalance(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  employeeId: string,
  type: Parameters<typeof provisionBalance>[3],
) {
  const settings = await tx.organizationSettings.findUniqueOrThrow({
    where: { organizationId: context.organizationId },
    select: { leaveYearStartMonth: true },
  });
  const now = new Date();
  await provisionBalance(tx, context, employeeId, type, settings.leaveYearStartMonth, now);
  return tx.leaveBalance.findUniqueOrThrow({
    where: {
      employeeId_leaveTypeId_periodStart_periodEnd: {
        employeeId,
        leaveTypeId: type.id,
        ...leavePeriod(now, settings.leaveYearStartMonth),
      },
    },
  });
}

/** A manager decides for their reports; a leave administrator for anyone. Never for oneself. */
export function assertDecider(
  context: DomainContext,
  employee: { userId: string | null; manager: { userId: string | null } | null },
) {
  if (employee.userId && employee.userId === context.actor.userId)
    throw new ForbiddenDomainError('You cannot decide your own request.');
  const isManager =
    Boolean(employee.manager?.userId) && employee.manager?.userId === context.actor.userId;
  if (!isManager && !has(context, 'leave.balances.adjust'))
    throw new ForbiddenDomainError('Only their manager or a leave administrator can decide this.');
}

/** Holders of a role that manages leave balances. */
export async function balanceManagers(tx: Prisma.TransactionClient, organizationId: string) {
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { isActive: true },
      role: {
        permissions: { some: { permission: { key: { in: ['leave.balances.adjust', '*'] } } } },
      },
    },
    select: { userId: true },
  });
  return holders.map((holder) => holder.userId);
}
