import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { describeDays, notify } from '../notifications/notify';
import { today } from './approval-authorization';

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const DAY_MS = 86_400_000;

type Row = {
  id: string;
  startsOn: Date;
  endsOn: Date;
  reason: string | null;
  revokedAt: Date | null;
  delegator: { id: string; displayName: string };
  delegate: { id: string; displayName: string };
};

/**
 * Handing one's approvals to a colleague while away.
 *
 * Anyone may hand over their own approvals — only what they could approve themselves passes, so a
 * person with none hands over nothing. The delegator keeps deciding too; the delegate never
 * decides their delegator's own requests. Ending one early is a revocation, kept on record.
 */
@Injectable()
export class ApprovalDelegationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Spans the caller gave and received that have not ended more than a month ago. */
  list(context: DomainContext) {
    const userId = self(context);
    const since = new Date(today().getTime() - 30 * DAY_MS);
    return this.database.run(context, async (tx) => {
      const rows = await tx.approvalDelegation.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [{ delegatorUserId: userId }, { delegateUserId: userId }],
          endsOn: { gte: since },
        },
        orderBy: { startsOn: 'desc' },
        include: {
          delegator: { select: { id: true, displayName: true } },
          delegate: { select: { id: true, displayName: true } },
        },
      });
      return {
        given: rows.filter((row) => row.delegator.id === userId).map(toDto),
        received: rows.filter((row) => row.delegate.id === userId).map(toDto),
      };
    });
  }

  /**
   * Who approvals can be handed to: current colleagues with an active login. Name and employee
   * ID only — enough to choose someone, nothing more about them.
   */
  candidates(context: DomainContext) {
    const userId = self(context);
    return this.database.run(context, (tx) =>
      tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          user: { is: { isActive: true } },
          NOT: { userId },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          employeeNumber: true,
          status: true,
        },
      }),
    );
  }

  create(
    context: DomainContext,
    input: { delegateEmployeeId: string; startsOn: string; endsOn: string; reason?: string },
  ) {
    const userId = self(context);
    const startsOn = dateOnly(input.startsOn);
    const endsOn = dateOnly(input.endsOn);
    if (Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime()))
      throw new ConflictError('Enter the first and last day of the handover.');
    if (endsOn < startsOn) throw new ConflictError('The last day cannot be before the first.');
    if (endsOn < today()) throw new ConflictError('A handover cannot end in the past.');
    if (endsOn.getTime() - startsOn.getTime() > 366 * DAY_MS)
      throw new ConflictError('Hand over approvals for a year at most.');
    return this.database.run(context, async (tx) => {
      const delegate = await tx.employee.findFirst({
        where: {
          id: input.delegateEmployeeId,
          organizationId: context.organizationId,
          status: 'ACTIVE',
        },
        select: {
          firstName: true,
          lastName: true,
          user: { select: { id: true, isActive: true } },
        },
      });
      if (!delegate) throw new NotFoundError('Employee');
      if (!delegate.user?.isActive)
        throw new ConflictError(
          `${delegate.firstName} ${delegate.lastName} has no active login, so cannot approve.`,
        );
      if (delegate.user.id === userId)
        throw new ConflictError('Choose someone other than yourself.');
      const overlap = await tx.approvalDelegation.findFirst({
        where: {
          organizationId: context.organizationId,
          delegatorUserId: userId,
          revokedAt: null,
          startsOn: { lte: endsOn },
          endsOn: { gte: startsOn },
        },
        select: { id: true },
      });
      if (overlap)
        throw new ConflictError('You already hand over your approvals for some of those days.');
      const created = await tx.approvalDelegation.create({
        data: {
          organizationId: context.organizationId,
          delegatorUserId: userId,
          delegateUserId: delegate.user.id,
          startsOn,
          endsOn,
          reason: input.reason?.trim() || null,
        },
        include: {
          delegator: { select: { id: true, displayName: true } },
          delegate: { select: { id: true, displayName: true } },
        },
      });
      await notify(tx, context, {
        recipients: [delegate.user.id],
        kind: 'APPROVALS_DELEGATED',
        title: 'You are covering approvals',
        body: `${created.delegator.displayName} handed you their approvals for ${describeDays(startsOn, endsOn)}.`,
        module: 'approvals',
        entityType: 'APPROVAL_DELEGATION',
        entityId: created.id,
      });
      await this.audit.record(
        context,
        {
          entityType: 'APPROVAL_DELEGATION',
          entityId: created.id,
          action: 'APPROVALS_DELEGATED',
          afterState: jsonSnapshot(created),
        },
        tx,
      );
      return toDto(created);
    });
  }

  revoke(context: DomainContext, delegationId: string) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const found = await tx.approvalDelegation.findFirst({
        where: { id: delegationId, organizationId: context.organizationId },
      });
      if (!found) throw new NotFoundError('Handover');
      if (found.delegatorUserId !== userId)
        throw new ForbiddenDomainError('Only the person who handed over approvals can end it.');
      if (found.revokedAt) throw new ConflictError('This handover has already ended.');
      const updated = await tx.approvalDelegation.update({
        where: { id: found.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        context,
        {
          entityType: 'APPROVAL_DELEGATION',
          entityId: found.id,
          action: 'APPROVAL_DELEGATION_REVOKED',
          beforeState: jsonSnapshot(found),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return { id: found.id, revoked: true };
    });
  }
}

function toDto(row: Row) {
  const day = today();
  return {
    id: row.id,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    reason: row.reason,
    delegator: { userId: row.delegator.id, name: row.delegator.displayName },
    delegate: { userId: row.delegate.id, name: row.delegate.displayName },
    status: row.revokedAt
      ? 'ENDED'
      : row.endsOn < day
        ? 'ENDED'
        : row.startsOn > day
          ? 'UPCOMING'
          : 'ACTIVE',
  };
}

function self(context: DomainContext) {
  if (context.accessMode !== 'NATIVE' || !context.actor.userId)
    throw new ForbiddenDomainError('Handing over approvals is for signed-in people only.');
  return context.actor.userId;
}
