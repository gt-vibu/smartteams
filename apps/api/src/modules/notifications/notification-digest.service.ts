import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { notificationMail } from '../../infrastructure/mail/mail.templates';
import { workDateInTimeZone } from '../attendance/attendance-shared';

export function digestDue(now: Date, timezone: string, lastSent?: Date | null) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  return (
    hour >= 8 &&
    (!lastSent || workDateInTimeZone(lastSent, timezone) !== workDateInTimeZone(now, timezone))
  );
}

@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}
  async sendPending(now = new Date()) {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, timezone: true },
      }),
    );
    let sent = 0;
    for (const organization of organizations) {
      if (!digestDue(now, organization.timezone)) continue;
      try {
        sent += await this.database.run(
          {
            organizationId: organization.id,
            accessMode: 'NATIVE',
            actor: { type: 'SYSTEM' },
            permissions: new Set(),
            requestId: randomUUID(),
            correlationId: randomUUID(),
          },
          async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`digest:${organization.id}`}, 0))`;
            const recipients = await tx.userOrganization.findMany({
              where: {
                organizationId: organization.id,
                status: 'ACTIVE',
                user: {
                  isActive: true,
                  emailNotifications: true,
                  notificationDelivery: 'DAILY_DIGEST',
                },
              },
              select: { user: { select: { id: true, email: true, displayName: true } } },
            });
            let queued = 0;
            for (const { user } of recipients) {
              const latest = await tx.notification.findFirst({
                where: {
                  organizationId: organization.id,
                  recipientUserId: user.id,
                  kind: { notIn: ['APPROVAL_ESCALATED', 'PAYROLL_RELEASED'] },
                  emailedAt: { not: null },
                },
                orderBy: { emailedAt: 'desc' },
                select: { emailedAt: true },
              });
              if (!digestDue(now, organization.timezone, latest?.emailedAt)) continue;
              const where = {
                organizationId: organization.id,
                recipientUserId: user.id,
                emailedAt: null,
                kind: { notIn: ['APPROVAL_ESCALATED', 'PAYROLL_RELEASED'] },
                createdAt: { lte: now },
              };
              const [count, sample] = await Promise.all([
                tx.notification.count({ where }),
                tx.notification.findMany({
                  where,
                  orderBy: { createdAt: 'desc' },
                  take: 20,
                  select: { title: true, body: true },
                }),
              ]);
              if (!count) continue;
              const base = (
                this.config.get<string>('APP_PUBLIC_URL') ||
                this.config.get<string>('WEB_ORG_URL') ||
                'http://localhost:3000'
              ).replace(/\/+$/, '');
              await this.mail.send(
                notificationMail({
                  to: user.email,
                  displayName: user.displayName,
                  organizationName: organization.name,
                  title: `${count} updates in your daily summary`,
                  body:
                    sample.map((item) => `${item.title}: ${item.body}`).join('\n') +
                    (count > sample.length
                      ? `\n${count - sample.length} more updates are available in the application.`
                      : ''),
                  url: `${base}/?module=approvals`,
                }),
                `digest-${organization.id}-${user.id}-${workDateInTimeZone(now, organization.timezone)}`,
              );
              await tx.notification.updateMany({ where, data: { emailedAt: now } });
              queued++;
            }
            return queued;
          },
          { timeout: 60000 },
        );
      } catch (caught) {
        this.logger.warn(
          `Digest skipped for ${organization.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    return sent;
  }
}
