import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { notificationMail } from '../../infrastructure/mail/mail.templates';

/** Older than this and an unsent notification is stale news; it is marked, not mailed. */
const FRESH_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

/**
 * Sends notifications by email, once each.
 *
 * A sweep rather than a send from inside the action: the action's transaction may still roll
 * back, and a person must never be emailed about a leave approval that did not happen. Only rows
 * that committed are seen here. Someone who turned email off has their notifications marked as
 * handled without a message, so turning it back on does not replay a backlog.
 */
@Injectable()
export class NotificationMailService {
  private readonly logger = new Logger(NotificationMailService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async sendPending(now = new Date()) {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
    );
    let sent = 0;
    for (const organization of organizations) {
      try {
        sent += await this.sendForOrganization(
          systemContext(organization.id),
          organization.name,
          now,
        );
      } catch (caught) {
        this.logger.warn(
          `Notification email skipped for ${organization.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    return sent;
  }

  private async sendForOrganization(context: DomainContext, organizationName: string, now: Date) {
    const base = (
      this.config.get<string>('APP_PUBLIC_URL') ||
      this.config.get<string>('WEB_ORG_URL') ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    return this.database.run(context, async (tx) => {
      const pending = await tx.notification.findMany({
        where: {
          organizationId: context.organizationId,
          emailedAt: null,
          OR: [
            { recipient: { notificationDelivery: 'IMMEDIATE' } },
            { kind: { in: ['APPROVAL_ESCALATED', 'PAYROLL_RELEASED'] } },
            { recipient: { emailNotifications: false } },
            { recipient: { isActive: false } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        include: {
          recipient: {
            select: { email: true, displayName: true, isActive: true, emailNotifications: true },
          },
        },
      });
      let sent = 0;
      for (const item of pending) {
        const wanted =
          item.recipient.isActive &&
          item.recipient.emailNotifications &&
          now.getTime() - item.createdAt.getTime() < FRESH_MS;
        if (wanted) {
          await this.mail.send(
            notificationMail({
              to: item.recipient.email,
              displayName: item.recipient.displayName,
              organizationName,
              title: item.title,
              body: item.body,
              url: item.module ? `${base}/?module=${encodeURIComponent(item.module)}` : base,
            }),
          );
          sent += 1;
        }
        await tx.notification.update({ where: { id: item.id }, data: { emailedAt: now } });
      }
      return sent;
    });
  }
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
