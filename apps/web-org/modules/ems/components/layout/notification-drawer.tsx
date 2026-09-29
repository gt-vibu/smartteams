'use client';

import React, { useEffect, useState } from 'react';
import type { Notification } from '@smarteam/contracts';
import {
  Button,
  Checkbox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import { useNotifications } from '../../hooks/use-notifications';
import { formatDate } from '@smarteam/contracts';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the screen a notification is about. */
  onSelectModule?: (module: string) => void;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date — from when the action happened. */
function timeAgo(iso: string, now: number) {
  const then = new Date(iso);
  const minutes = Math.floor((now - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(then);
}

function iconFor(kind: string) {
  if (kind.startsWith('TIMESHEET')) return '⏱';
  if (kind.startsWith('ATTENDANCE') || kind.startsWith('SHIFT')) return '📅';
  if (kind.startsWith('PAYSLIP')) return '₹';
  if (kind.startsWith('DOCUMENT')) return '📄';
  if (kind === 'APPROVAL_ESCALATED') return '⚠';
  if (kind === 'APPROVAL_REMINDER') return '⏰';
  return '✓';
}

export function NotificationDrawer({ isOpen, onClose, onSelectModule }: NotificationDrawerProps) {
  const { persona } = useAuth();
  const { items, unread, loading, error, refetch, markRead, markAllRead, emailEnabled, setEmail } =
    useNotifications();
  // New first: a notification leaves this list once it is read — here, on its screen, or by
  // "Mark all read". Everything stays under All.
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('UNREAD');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    void refetch();
  }, [isOpen, refetch]);

  const filtered = items.filter((item) => filter === 'ALL' || !item.readAt);

  const open = (item: Notification) => {
    void markRead(item);
    if (item.module && onSelectModule) {
      onSelectModule(item.module);
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="p-3">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Activity and updates for {persona.name.split(' ')[0]}.
          </SheetDescription>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              className="self-start px-0"
              onClick={() => void markAllRead()}
            >
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
              {option === 'ALL' ? 'All' : `New${unread ? ` (${unread})` : ''}`}
            </Button>
          ))}
        </div>
        {error && (
          <p className="mb-2 text-[11px] font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground" role="status">
            Loading notifications…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground" role="status">
            You are all caught up.
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {filtered.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => open(item)}
                className={`flex w-full items-start gap-3 rounded-md border p-3 text-left shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.readAt ? 'border-border bg-card' : 'border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80'}`}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm"
                  aria-hidden="true"
                >
                  {iconFor(item.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold">{item.title}</span>
                    <time
                      className="shrink-0 text-[10px] text-muted-foreground"
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {timeAgo(item.createdAt, now)}
                    </time>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {emailEnabled !== null && (
          <label className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-foreground">
            <Checkbox
              checked={emailEnabled}
              className="mt-0.5"
              onCheckedChange={(checked) => void setEmail(checked === true)}
            />
            <span>
              Also email me these
              <span className="block text-[11px] text-muted-foreground">
                Approvals waiting for you and decisions on your requests.
              </span>
            </span>
          </label>
        )}
      </SheetContent>
    </Sheet>
  );
}
