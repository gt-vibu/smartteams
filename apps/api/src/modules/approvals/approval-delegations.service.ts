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
import {
  DAY_MS,
  DELEGATION_INCLUDE,
  activeLogin,
  administersCover,
  delegationSpan,
  delegationStatus,
  signedInUser,
  toDelegationDto,
} from './approval-delegation-view';

/**
 * Handing one's approvals to a colleague while away.
 *
 * Anyone may ask a colleague to cover their approvals; the colleague accepts or declines, and
 * nothing is handed over until they accept. An administrator may set cover up for anyone, which
 * takes effect without asking. Only what the person away could approve passes; they keep deciding
 * too, and the one covering never decides their own requests. Ending one early is kept on record.
 */
@Injectable()
export class ApprovalDelegationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Handovers the caller gave and was asked to cover, not ended more than a month ago. An
   * administrator also sees everyone's, to set cover up or end it.
   */
  list(context: DomainContext) {
    const userId = signedInUser(context);
    const since = new Date(today().getTime() - 30 * DAY_MS);
    const everyone = administersCover(context);
    return this.database.run(context, async (tx) => {
      const rows = await tx.approvalDelegation.findMany({
        where: {
          organizationId: context.organizationId,
          ...(everyone ? {} : { OR: [{ delegatorUserId: userId }, { delegateUserId: userId }] }),
          endsOn: { gte: since },
        },
        orderBy: { startsOn: 'desc' },
        include: DELEGATION_INCLUDE,
      });
      return {
        given: rows.filter((row) => row.delegator.id === userId).map(toDelegationDto),
        received: rows.filter((row) => row.delegate.id === userId).map(toDelegationDto),
        ...(everyone ? { all: rows.map(toDelegationDto) } : {}),
        canSetForOthers: everyone,
      };
    });
  }

  /**
   * Who approvals can be handed to: current colleagues with an active login. Name and employee
   * ID only — enough to choose someone, nothing more about them.
   */
  candidates(context: DomainContext) {
    const userId = signedInUser(context);
    return this.database.run(context, (tx) =>
      tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          user: { is: { isActive: true } },
          // An administrator chooses the person away as well, so they may be anyone.
          ...(administersCover(context) ? {} : { NOT: { userId } }),
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

  /**
   * Asks a colleague to cover, or — for an administrator naming the person away — sets cover up
   * outright. `delegatorEmployeeId` is only for administrators; everyone else hands over their own.
   */
  create(
    context: DomainContext,
    input: {
      delegateEmployeeId: string;
      delegatorEmployeeId?: string;
      startsOn: string;
      endsOn: string;
      reason?: string;
    },
  ) {
    const userId = signedInUser(context);
    const { startsOn, endsOn } = delegationSpan(input);
    return this.database.run(context, async (tx) => {
      const delegator = input.delegatorEmployeeId
        ? await activeLogin(tx, context.organizationId, input.delegatorEmployeeId)
        : { userId, name: null };
      const onBehalf = delegator.userId !== userId;
      if (onBehalf && !administersCover(context))
        throw new ForbiddenDomainError('Only an administrator can set up cover for someone else.');
      const delegate = await activeLogin(tx, context.organizationId, input.delegateEmployeeId);
      if (delegate.userId === delegator.userId)
        throw new ConflictError('Choose someone other than the person who is away.');
      const overlap = await tx.approvalDelegation.findFirst({
        where: {
          organizationId: context.organizationId,
          delegatorUserId: delegator.userId,
          revokedAt: null,
          declinedAt: null,
          startsOn: { lte: endsOn },
          endsOn: { gte: startsOn },
        },
        select: { id: true },
      });
      if (overlap)
        throw new ConflictError(
          onBehalf
            ? `${delegator.name} already has cover for some of those days.`
            : 'You already hand over your approvals for some of those days.',
        );
      const created = await tx.approvalDelegation.create({
        data: {
          organizationId: context.organizationId,
          delegatorUserId: delegator.userId,
          delegateUserId: delegate.userId,
          startsOn,
          endsOn,
          reason: input.reason?.trim() || null,
          createdByUserId: userId,
          // An administrator's arrangement stands; a colleague's request waits for an answer.
          acceptedAt: onBehalf ? new Date() : null,
        },
        include: DELEGATION_INCLUDE,
      });
      const days = describeDays(startsOn, endsOn);
      await notify(tx, context, {
        recipients: [delegate.userId],
        kind: onBehalf ? 'APPROVALS_DELEGATED' : 'APPROVALS_COVER_REQUESTED',
        title: onBehalf ? 'You are covering approvals' : 'Can you cover approvals?',
        body: onBehalf
          ? `You cover ${created.delegator.displayName}'s approvals for ${days}.`
          : `${created.delegator.displayName} asks you to cover their approvals for ${days}. Accept or decline in Approvals.`,
        module: 'approvals',
        entityType: 'APPROVAL_DELEGATION',
        entityId: created.id,
      });
      if (onBehalf)
        await notify(tx, context, {
          recipients: [delegator.userId],
          kind: 'APPROVALS_DELEGATED',
          title: 'Your approvals are covered',
          body: `${created.delegate.displayName} covers your approvals for ${days}.`,
          module: 'approvals',
          entityType: 'APPROVAL_DELEGATION',
          entityId: created.id,
        });
      await this.record(context, tx, created.id, 'APPROVALS_DELEGATED', null, created);
      return toDelegationDto(created);
    });
  }

  /** The colleague asked to cover says yes or no. Only they can, and only while it is pending. */
  respond(context: DomainContext, delegationId: string, accept: boolean) {
    const userId = signedInUser(context);
    return this.database.run(context, async (tx) => {
      const found = await tx.approvalDelegation.findFirst({
        where: { id: delegationId, organizationId: context.organizationId },
        include: DELEGATION_INCLUDE,
      });
      if (!found) throw new NotFoundError('Handover');
      if (found.delegateUserId !== userId)
        throw new ForbiddenDomainError('Only the person asked to cover can answer.');
      if (delegationStatus(found) !== 'PENDING')
        throw new ConflictError('This request has already been answered or has ended.');
      const updated = await tx.approvalDelegation.update({
        where: { id: found.id },
        data: accept ? { acceptedAt: new Date() } : { declinedAt: new Date() },
        include: DELEGATION_INCLUDE,
      });
      await notify(tx, context, {
        recipients: [found.delegatorUserId],
        kind: accept ? 'APPROVALS_COVER_ACCEPTED' : 'APPROVALS_COVER_DECLINED',
        title: accept ? 'Cover accepted' : 'Cover declined',
        body: `${found.delegate.displayName} ${accept ? 'will cover' : 'cannot cover'} your approvals for ${describeDays(found.startsOn, found.endsOn)}.`,
        module: 'approvals',
        entityType: 'APPROVAL_DELEGATION',
        entityId: found.id,
      });
      await this.record(
        context,
        tx,
        found.id,
        accept ? 'APPROVAL_DELEGATION_ACCEPTED' : 'APPROVAL_DELEGATION_DECLINED',
        found,
        updated,
      );
      return toDelegationDto(updated);
    });
  }

  /** Ends a handover early: the person away, or an administrator. */
  revoke(context: DomainContext, delegationId: string) {
    const userId = signedInUser(context);
    return this.database.run(context, async (tx) => {
      const found = await tx.approvalDelegation.findFirst({
        where: { id: delegationId, organizationId: context.organizationId },
      });
      if (!found) throw new NotFoundError('Handover');
      if (found.delegatorUserId !== userId && !administersCover(context))
        throw new ForbiddenDomainError('Only the person who handed over approvals can end it.');
      if (found.revokedAt) throw new ConflictError('This handover has already ended.');
      const updated = await tx.approvalDelegation.update({
        where: { id: found.id },
        data: { revokedAt: new Date() },
      });
      await this.record(context, tx, found.id, 'APPROVAL_DELEGATION_REVOKED', found, updated);
      return { id: found.id, revoked: true };
    });
  }

  private record(
    context: DomainContext,
    tx: Parameters<AuditService['record']>[2],
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(
      context,
      {
        entityType: 'APPROVAL_DELEGATION',
        entityId,
        action,
        ...(before ? { beforeState: jsonSnapshot(before) } : {}),
        afterState: jsonSnapshot(after),
      },
      tx,
    );
  }
}
