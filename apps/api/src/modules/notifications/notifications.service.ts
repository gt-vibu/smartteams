import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

/**
 * The signed-in person's notifications, and nobody else's.
 *
 * Every query is keyed on the caller's own user id as well as the organization, so an id from
 * someone else's list cannot be read or marked read — it answers "not found", as for any record
 * the caller may not see.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly database: TenantDatabaseService) {}

  list(context: DomainContext, options: { unreadOnly?: boolean; limit?: number }) {
    const userId = self(context);
    const take = Math.min(Math.max(options.limit ?? 30, 1), 100);
    return this.database.run(context, async (tx) => {
      const where = { organizationId: context.organizationId, recipientUserId: userId };
      const [items, unread, byModule] = await Promise.all([
        tx.notification.findMany({
          where: { ...where, ...(options.unreadOnly ? { readAt: null } : {}) },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        tx.notification.count({ where: { ...where, readAt: null } }),
        tx.notification.groupBy({
          by: ['module'],
          where: { ...where, readAt: null, module: { not: null } },
          _count: { _all: true },
        }),
      ]);
      return {
        unread,
        /** Unread per screen, so the navigation can mark where there is something new. */
        unreadByModule: Object.fromEntries(
          byModule.map((group) => [group.module ?? '', group._count._all]),
        ),
        items: items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          body: item.body,
          module: item.module,
          entityType: item.entityType,
          entityId: item.entityId,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt ? item.readAt.toISOString() : null,
        })),
      };
    });
  }

  markRead(context: DomainContext, notificationId: string) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const found = await tx.notification.findFirst({
        where: {
          id: notificationId,
          organizationId: context.organizationId,
          recipientUserId: userId,
        },
        select: { id: true, readAt: true },
      });
      if (!found) throw new NotFoundError('Notification');
      // Marking twice keeps the first time it was read.
      if (!found.readAt)
        await tx.notification.update({ where: { id: found.id }, data: { readAt: new Date() } });
      return { id: found.id, read: true };
    });
  }

  /** The caller's own delivery choices. */
  preferences(context: DomainContext) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailNotifications: true },
      });
      return { email: user.emailNotifications };
    });
  }

  setPreferences(context: DomainContext, input: { email: boolean }) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { emailNotifications: input.email },
        select: { emailNotifications: true },
      });
      return { email: user.emailNotifications };
    });
  }

  /** Everything unread about one screen, read because the person opened it. */
  markModuleRead(context: DomainContext, module: string) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const result = await tx.notification.updateMany({
        where: {
          organizationId: context.organizationId,
          recipientUserId: userId,
          module,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      return { marked: result.count };
    });
  }

  markAllRead(context: DomainContext) {
    const userId = self(context);
    return this.database.run(context, async (tx) => {
      const result = await tx.notification.updateMany({
        where: { organizationId: context.organizationId, recipientUserId: userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { marked: result.count };
    });
  }
}

function self(context: DomainContext) {
  const userId = context.actor.userId;
  // An undefined id in the filters above would match every row, so it is refused outright.
  if (!userId)
    throw new ForbiddenDomainError('Notifications are available to signed-in users only');
  return userId;
}
