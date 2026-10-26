import type { DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { today } from './approval-authorization';

export const DAY_MS = 86_400_000;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/** The people on a handover, as a list or a response shows them. */
export const DELEGATION_INCLUDE = {
  delegator: { select: { id: true, displayName: true } },
  delegate: { select: { id: true, displayName: true } },
} as const;

export type DelegationRow = {
  id: string;
  startsOn: Date;
  endsOn: Date;
  reason: string | null;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  createdByUserId: string | null;
  delegatorUserId: string;
  delegator: { id: string; displayName: string };
  delegate: { id: string; displayName: string };
};

/**
 * Where a handover stands. PENDING waits for the person covering to accept; DECLINED is their
 * answer; once accepted it is UPCOMING, ACTIVE or ENDED by its dates, like any other.
 */
export function delegationStatus(row: DelegationRow, day = today()) {
  if (row.revokedAt) return 'ENDED';
  if (row.declinedAt) return 'DECLINED';
  if (row.endsOn < day) return 'ENDED';
  if (!row.acceptedAt) return 'PENDING';
  return row.startsOn > day ? 'UPCOMING' : 'ACTIVE';
}

export function toDelegationDto(row: DelegationRow) {
  return {
    id: row.id,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    reason: row.reason,
    delegator: { userId: row.delegator.id, name: row.delegator.displayName },
    delegate: { userId: row.delegate.id, name: row.delegate.displayName },
    /** Set up by an administrator rather than by the person away; needs no acceptance. */
    setByAdministrator: Boolean(row.createdByUserId && row.createdByUserId !== row.delegatorUserId),
    status: delegationStatus(row),
  };
}

/** The first and last day, checked: in order, not over, and at most a year apart. */
export function delegationSpan(input: { startsOn: string; endsOn: string }) {
  const startsOn = dateOnly(input.startsOn);
  const endsOn = dateOnly(input.endsOn);
  if (Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime()))
    throw new ConflictError('Enter the first and last day of the handover.');
  if (endsOn < startsOn) throw new ConflictError('The last day cannot be before the first.');
  if (endsOn < today()) throw new ConflictError('A handover cannot end in the past.');
  if (endsOn.getTime() - startsOn.getTime() > 366 * DAY_MS)
    throw new ConflictError('Hand over approvals for a year at most.');
  return { startsOn, endsOn };
}

/** Whether the caller manages approval routing, and so may set or end anyone's handover. */
export function administersCover(context: DomainContext) {
  return context.permissions.has('*') || context.permissions.has('approval-policies.write');
}

export function signedInUser(context: DomainContext) {
  if (context.accessMode !== 'NATIVE' || !context.actor.userId)
    throw new ForbiddenDomainError('Handing over approvals is for signed-in people only.');
  return context.actor.userId;
}

/** A current employee with a login that can sign in; approvals travel between logins. */
export async function activeLogin(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
) {
  const person = await tx.employee.findFirst({
    where: { id: employeeId, organizationId, status: 'ACTIVE' },
    select: { firstName: true, lastName: true, user: { select: { id: true, isActive: true } } },
  });
  if (!person) throw new NotFoundError('Employee');
  const name = `${person.firstName} ${person.lastName}`;
  if (!person.user?.isActive)
    throw new ConflictError(`${name} has no active login, so cannot take part in approvals.`);
  return { userId: person.user.id, name };
}
