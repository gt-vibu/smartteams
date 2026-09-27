'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Notification } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { notificationsRepository } from '../repositories/notifications.repository';
import { emitDataChanged, type DataTopic } from '../lib/data-events';

const POLL_MS = 60_000;

/** The data each screen reloads when something new arrives about it. */
const TOPIC_BY_MODULE: Record<string, DataTopic> = {
  approvals: 'approvals',
  attendance: 'attendance',
  holidays: 'holidays',
  payroll: 'payroll',
  timesheet: 'timesheets',
  'time-off': 'leave',
};

/**
 * Screens that are not marked with a dot or read by opening them. Home is where everyone lands,
 * so reading its notifications on arrival would clear them before anyone looked at the bell.
 */
const UNMARKED_MODULES = new Set(['home']);

/**
 * The signed-in person's notifications: what they are asked to decide, and what was decided for
 * them. Polled once a minute while the tab is visible, so the bell and the navigation dots reflect
 * actions taken by others without a reload. One instance, shared through `NotificationsProvider`,
 * so the bell, the dots and the screen being read never disagree.
 */
function useNotificationFeed() {
  const { session } = useSession();
  const organizationId = session?.organizationId || null;
  const [error, setError] = useState<string | null>(null);

  const feed = useAsyncResource(
    () => notificationsRepository.list(organizationId!, { limit: 50 }),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const { refetch } = feed;
  const prefs = useAsyncResource(
    () => notificationsRepository.preferences(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const [emailOverride, setEmailOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [organizationId, refetch]);

  // Something new about a screen: that screen reloads, so a request someone just raised is on it
  // when its approver looks. Nothing is announced for what was already there on the first load.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const items = feed.data?.items;
    if (!items) return;
    const arrived = known.current ? items.filter((item) => !known.current?.has(item.id)) : [];
    known.current = new Set(items.map((item) => item.id));
    const topics = [
      ...new Set(
        arrived.flatMap((item) => {
          const topic = item.module ? TOPIC_BY_MODULE[item.module] : undefined;
          return topic ? [topic] : [];
        }),
      ),
    ];
    if (topics.length > 0) emitDataChanged(...topics);
  }, [feed.data]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      try {
        await action();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update notifications.');
      }
      await refetch();
    },
    [refetch],
  );

  const markRead = useCallback(
    (item: Notification) =>
      item.readAt || !organizationId
        ? Promise.resolve()
        : run(() => notificationsRepository.markRead(organizationId, item.id)),
    [organizationId, run],
  );

  const markAllRead = useCallback(
    () =>
      organizationId
        ? run(() => notificationsRepository.markAllRead(organizationId))
        : Promise.resolve(),
    [organizationId, run],
  );

  const unreadByModule = useMemo(() => {
    const counts = { ...(feed.data?.unreadByModule ?? {}) };
    for (const module of UNMARKED_MODULES) delete counts[module];
    return counts;
  }, [feed.data]);

  // One call per screen at a time: the screen and the navigation can both ask as it opens.
  const reading = useRef(new Set<string>());
  const markModuleRead = useCallback(
    async (module: string) => {
      if (!organizationId || !unreadByModule[module] || reading.current.has(module)) return;
      reading.current.add(module);
      try {
        await run(() => notificationsRepository.markModuleRead(organizationId, module));
      } finally {
        reading.current.delete(module);
      }
    },
    [organizationId, run, unreadByModule],
  );

  const setEmail = useCallback(
    async (email: boolean) => {
      if (!organizationId) return;
      setEmailOverride(email);
      setError(null);
      try {
        await notificationsRepository.setEmail(organizationId, email);
      } catch (caught) {
        setEmailOverride(null);
        setError(caught instanceof Error ? caught.message : 'Could not save that choice.');
      }
    },
    [organizationId],
  );

  return {
    /** Null until known, so the switch is not shown in a state the person never chose. */
    emailEnabled: emailOverride ?? prefs.data?.email ?? null,
    setEmail,
    items: feed.data?.items ?? [],
    unread: feed.data?.unread ?? 0,
    /** Unread per screen id, for the navigation's dots. */
    unreadByModule,
    loading: feed.loading,
    error: error ?? feed.error,
    refetch,
    markRead,
    markAllRead,
    markModuleRead,
  };
}

export type NotificationsState = ReturnType<typeof useNotificationFeed>;

const NotificationsContext = createContext<NotificationsState | null>(null);

/** Holds the one notification feed for the workspace. */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const state = useNotificationFeed();
  return React.createElement(NotificationsContext.Provider, { value: state }, children);
}

export function useNotifications(): NotificationsState {
  const state = useContext(NotificationsContext);
  if (!state) throw new Error('useNotifications needs a NotificationsProvider above it');
  return state;
}

const NONE: Record<string, number> = {};

/** Unread per screen, or none outside a workspace (a navigation rendered on its own). */
export function useUnreadByModule(): Record<string, number> {
  return useContext(NotificationsContext)?.unreadByModule ?? NONE;
}
