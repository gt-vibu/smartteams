import { parseNotificationFeed, type NotificationFeed } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * The signed-in person's own notifications. The server keys every call on the caller, so there is
 * no recipient parameter to get wrong: one person reading a notification never reads it for another.
 */

const base = (organizationId: string) => orgPath(organizationId, '/notifications');

export const notificationsRepository = {
  async list(organizationId: string, options: { limit?: number } = {}): Promise<NotificationFeed> {
    return expectShape(
      parseNotificationFeed(
        await apiRequest(`${base(organizationId)}${queryString(options)}`, { method: 'GET' }),
      ),
      'notification list',
    );
  },

  async markRead(organizationId: string, notificationId: string): Promise<void> {
    await apiRequest(`${base(organizationId)}/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    });
  },

  /** Whether the caller is also emailed. Each person decides only for themselves. */
  async preferences(organizationId: string): Promise<{ email: boolean }> {
    const payload = (await apiRequest(`${base(organizationId)}/preferences`, {
      method: 'GET',
    })) as { email?: unknown };
    return { email: payload.email !== false };
  },

  async setEmail(organizationId: string, email: boolean): Promise<{ email: boolean }> {
    const payload = (await apiRequest(`${base(organizationId)}/preferences`, {
      method: 'PUT',
      body: { email },
    })) as { email?: unknown };
    return { email: payload.email !== false };
  },

  /** Everything unread about one screen, because the person has opened it. */
  async markModuleRead(organizationId: string, module: string): Promise<void> {
    await apiRequest(`${base(organizationId)}/read-module`, { method: 'POST', body: { module } });
  },

  async markAllRead(organizationId: string): Promise<void> {
    await apiRequest(`${base(organizationId)}/read-all`, { method: 'POST' });
  },
};
