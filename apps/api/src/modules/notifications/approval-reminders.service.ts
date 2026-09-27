import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { notify } from './notify';

const DAY_MS = 86_400_000;
/** The notifications that say "this is waiting for you". */
const PENDING_KINDS = ['LEAVE_PENDING', 'TIMESHEET_PENDING', 'ATTENDANCE_CORRECTION_PENDING'];
/** Beyond this, a request is stale history rather than something to chase. */
const LOOK_BACK_DAYS = 60;

/**
 * Following up requests nobody has decided.
 *
 * The people a request waits on are exactly those the last "waiting for you" notification went to
 * — the current step's approvers and anyone covering for them — so the reminder goes to them,
 * with no second routing to drift from the first. After the organization's reminder delay they are
 * reminded once a day; after its escalation delay the administrators are told, once. Either delay
 * set to zero turns that step off. A request decided in the meantime is left alone.
 */
@Injectable()
export class ApprovalRemindersService {
  private readonly logger = new Logger(ApprovalRemindersService.name);

  constructor(private readonly database: TenantDatabaseService) {}

  async sweep(now = new Date()) {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
    );
    let sent = 0;
    for (const organization of organizations) {
      try {
        sent += await this.database.run(systemContext(organization.id), (tx) =>
          this.sweepOrganization(tx, systemContext(organization.id), now),
        );
      } catch (caught) {
        this.logger.warn(
          `Approval reminders skipped for ${organization.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    return sent;
  }

  private async sweepOrganization(tx: Prisma.TransactionClient, context: DomainContext, now: Date) {
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId: context.organizationId },
      select: { approvalReminderDays: true, approvalEscalationDays: true },
    });
    const remindAfter = settings?.approvalReminderDays ?? 0;
    const escalateAfter = settings?.approvalEscalationDays ?? 0;
    if (remindAfter <= 0 && escalateAfter <= 0) return 0;
    const earliest = Math.min(...[remindAfter, escalateAfter].filter((days) => days > 0));

    const waiting = await tx.notification.findMany({
      where: {
        organizationId: context.organizationId,
        kind: { in: PENDING_KINDS },
        entityId: { not: null },
        createdAt: {
          lte: new Date(now.getTime() - earliest * DAY_MS),
          gte: new Date(now.getTime() - LOOK_BACK_DAYS * DAY_MS),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        recipientUserId: true,
        kind: true,
        title: true,
        body: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });
    // The latest step for each request: the newest "waiting" batch, sent in one transaction.
    const latest = new Map<string, typeof waiting>();
    for (const row of waiting) {
      const key = row.entityId!;
      const batch = latest.get(key);
      if (!batch) latest.set(key, [row]);
      else if (batch[0]!.createdAt.getTime() - row.createdAt.getTime() < 60_000) batch.push(row);
    }
    // A later step than the batch found means the request moved on; it is chased from there.
    const newer = await tx.notification.findMany({
      where: {
        organizationId: context.organizationId,
        kind: { in: PENDING_KINDS },
        entityId: { in: [...latest.keys()] },
        createdAt: { gt: new Date(now.getTime() - earliest * DAY_MS) },
      },
      select: { entityId: true },
    });
    for (const row of newer) latest.delete(row.entityId!);

    let sent = 0;
    for (const [entityId, batch] of latest) {
      const first = batch[0]!;
      if (!(await stillWaiting(tx, context.organizationId, first.entityType, entityId))) continue;
      const days = Math.floor((now.getTime() - first.createdAt.getTime()) / DAY_MS);
      const recipients = batch.map((row) => row.recipientUserId);

      if (remindAfter > 0 && days >= remindAfter) {
        const remindedToday = await tx.notification.findFirst({
          where: {
            organizationId: context.organizationId,
            kind: 'APPROVAL_REMINDER',
            entityId,
            createdAt: { gt: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (!remindedToday) {
          await notify(tx, context, {
            recipients,
            kind: 'APPROVAL_REMINDER',
            title: `Still waiting: ${first.title.toLowerCase()}`,
            body: `${first.body} It has waited ${days} day${days === 1 ? '' : 's'}.`,
            module: 'approvals',
            entityType: first.entityType ?? undefined,
            entityId,
          });
          sent += recipients.length;
        }
      }

      if (escalateAfter > 0 && days >= escalateAfter) {
        const escalated = await tx.notification.findFirst({
          where: { organizationId: context.organizationId, kind: 'APPROVAL_ESCALATED', entityId },
          select: { id: true },
        });
        if (!escalated) {
          const admins = (await administrators(tx, context.organizationId)).filter(
            (userId) => !recipients.includes(userId),
          );
          await notify(tx, context, {
            recipients: admins,
            kind: 'APPROVAL_ESCALATED',
            title: 'A request is waiting too long',
            body: `${first.body} Nobody has decided it in ${days} days.`,
            module: 'approvals',
            entityType: first.entityType ?? undefined,
            entityId,
          });
          sent += admins.length;
        }
      }
    }
    return sent;
  }
}

async function stillWaiting(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entityType: string | null,
  id: string,
) {
  if (entityType === 'LEAVE_REQUEST')
    return Boolean(
      await tx.leaveRequest.findFirst({ where: { id, organizationId, status: 'PENDING' } }),
    );
  if (entityType === 'TIMESHEET')
    return Boolean(
      await tx.timesheet.findFirst({ where: { id, organizationId, status: 'SUBMITTED' } }),
    );
  if (entityType === 'ATTENDANCE_CORRECTION')
    return Boolean(
      await tx.attendanceCorrection.findFirst({ where: { id, organizationId, status: 'PENDING' } }),
    );
  return false;
}

/** Holders of the organization-wide administrator grant. */
async function administrators(tx: Prisma.TransactionClient, organizationId: string) {
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      branchId: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { isActive: true },
      role: { permissions: { some: { permission: { key: '*' } } } },
    },
    select: { userId: true },
  });
  return [...new Set(holders.map((holder) => holder.userId))];
}

function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set<string>(),
  };
}
