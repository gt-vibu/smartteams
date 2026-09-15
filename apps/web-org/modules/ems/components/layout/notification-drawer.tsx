'use client';

import React, { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  category: 'APPROVAL' | 'ATTENDANCE' | 'TIMESHEET' | 'ANNOUNCEMENT';
  isRead: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Timesheet Approved',
    description: 'Your timesheet (Aug 18 - Aug 24) has been approved by your manager.',
    time: '5 mins ago',
    category: 'TIMESHEET',
    isRead: false,
  },
  {
    id: 'notif-2',
    title: 'Leave Request Approved',
    description: 'Your casual leave application for Aug 28, 2026 was signed off.',
    time: '2 hours ago',
    category: 'APPROVAL',
    isRead: false,
  },
  {
    id: 'notif-3',
    title: 'New Policy Announcement',
    description:
      'Organization published updated Q3 Hybrid Work & Biometric Verification guidelines.',
    time: '1 day ago',
    category: 'ANNOUNCEMENT',
    isRead: true,
  },
  {
    id: 'notif-4',
    title: 'Shift Timetable Scheduled',
    description: 'General Day Shift (09:30 AM - 06:30 PM) rostered for upcoming cycle.',
    time: '2 days ago',
    category: 'ATTENDANCE',
    isRead: true,
  },
];

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const { persona } = useAuth();
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const filtered = notifications.filter((notification) => filter === 'ALL' || !notification.isRead);

  const markAllRead = () =>
    setNotifications((previous) =>
      previous.map((notification) => ({ ...notification, isRead: true })),
    );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="p-3">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Activity and updates for {persona.name.split(' ')[0]}.
          </SheetDescription>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" className="self-start px-0" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </SheetHeader>
        <div
          role="tablist"
          aria-label="Notification filter"
          className="mb-3 flex gap-2 border-b border-border pb-2"
        >
          {(['ALL', 'UNREAD'] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={filter === option ? 'secondary' : 'ghost'}
              role="tab"
              aria-selected={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === 'ALL' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}
            </Button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground" role="status">
            You are all caught up.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`flex items-start gap-3 rounded-md border p-3 shadow-xs ${item.isRead ? 'border-border bg-card' : 'border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80'}`}
              >
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm"
                  aria-hidden="true"
                >
                  {item.category === 'APPROVAL'
                    ? '✓'
                    : item.category === 'TIMESHEET'
                      ? '⏱'
                      : item.category === 'ANNOUNCEMENT'
                        ? '📢'
                        : '📅'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold">{item.title}</span>
                    <time className="shrink-0 text-[10px] text-muted-foreground">{item.time}</time>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
