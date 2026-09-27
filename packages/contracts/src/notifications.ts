import { z } from 'zod';

/**
 * In-app notifications, matching what `NotificationsService` returns.
 *
 * Each row belongs to one recipient. Reading it marks it read for that person only, and
 * `createdAt` is when the action it describes committed, not when it was fetched.
 */

export const notificationSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  module: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationFeedSchema = z.object({
  unread: z.number().int().nonnegative(),
  /** Unread per screen id ('approvals', 'time-off', …); absent from servers that predate it. */
  unreadByModule: z.record(z.string(), z.number().int().nonnegative()).default({}),
  items: z.array(notificationSchema),
});

export type NotificationFeed = z.infer<typeof notificationFeedSchema>;

export function parseNotificationFeed(payload: unknown): NotificationFeed | null {
  const result = notificationFeedSchema.safeParse(payload);
  return result.success ? result.data : null;
}
