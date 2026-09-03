'use client';

import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button, SegmentedTabs } from '@smarteam/ui';
import { useLeaveAdmin } from '../../hooks/use-leave-admin';
import { useTeamDirectory } from '../../hooks/use-team-directory';
import { LeaveRequestQueue } from './leave-request-queue';
import { LeavePolicyPanel } from './leave-policy-panel';
import { LeaveBalancesPanel } from './leave-balances-panel';

type Tab = 'requests' | 'balances' | 'types';

/**
 * Organization-wide leave.
 *
 * Replaces a 1,055-line screen driven by `leave.json` and `leave-policies.json`, split here into
 * a queue, a balances table and a policy panel so each stays readable on its own.
 */
export function ScreenLeaveAdmin() {
  const admin = useLeaveAdmin();
  // Branches come from the team directory, which already loads them; leave assignment needs the
  // branch list and there is no reason to fetch it twice.
  const directory = useTeamDirectory();
  const [tab, setTab] = useScreenTab<Tab>(
    'leaveTab',
    ['requests', 'balances', 'types'],
    'requests',
  );
  const [status, setStatus] = useState('PENDING');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of admin.requests) {
      map.set(request.status, (map.get(request.status) ?? 0) + 1);
    }
    return map;
  }, [admin.requests]);

  const statusTabs = [
    { id: 'PENDING', label: 'Pending', tone: 'var(--warning, oklch(0.75 0.15 75))' },
    { id: 'APPROVED', label: 'Approved', tone: 'var(--success)' },
    { id: 'REJECTED', label: 'Rejected', tone: 'var(--destructive)' },
    { id: 'CANCELLED', label: 'Cancelled', tone: 'var(--muted-foreground)' },
    { id: 'ALL', label: 'All' },
  ].map((entry) => ({
    ...entry,
    count: entry.id === 'ALL' ? admin.requests.length : (counts.get(entry.id) ?? 0),
  }));

  const visible =
    status === 'ALL'
      ? admin.requests
      : admin.requests.filter((request) => request.status === status);

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        description="Requests, balances and the leave types they draw from."
        icon={CalendarDays}
        title="Leave"
        tone="accent"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <SegmentedTabs
          aria-label="Leave administration sections"
          items={[
            { id: 'requests', label: 'Requests', count: counts.get('PENDING') ?? 0 },
            { id: 'balances', label: 'Balances' },
            { id: 'types', label: 'Leave types' },
          ]}
          onValueChange={(value) => setTab(value as Tab)}
          value={tab}
        />
        <span className="pb-2 text-[11px] text-muted-foreground">
          {admin.inbox.length} awaiting your decision
        </span>
      </div>

      {admin.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading leave...
        </p>
      )}

      {!admin.loading && admin.forbidden && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-semibold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view leave.
          </p>
        </div>
      )}

      {!admin.loading && admin.error && !admin.forbidden && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
          <p className="text-sm font-semibold text-foreground">Could not load leave</p>
          <p className="mt-1 text-xs text-muted-foreground">{admin.error}</p>
          <Button
            className="mt-3"
            onClick={() => void admin.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!admin.loading && !admin.error && (
        <>
          {tab === 'requests' && (
            <>
              <SegmentedTabs
                aria-label="Filter requests by status"
                items={statusTabs}
                onValueChange={setStatus}
                value={status}
              />
              <LeaveRequestQueue admin={admin} requests={visible} />
            </>
          )}

          {tab === 'balances' && <LeaveBalancesPanel admin={admin} />}

          {tab === 'types' && <LeavePolicyPanel admin={admin} branches={directory.branches} />}
        </>
      )}
    </div>
  );
}
