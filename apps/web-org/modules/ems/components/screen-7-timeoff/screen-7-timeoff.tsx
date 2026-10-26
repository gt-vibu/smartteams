'use client';

import React, { useMemo, useState } from 'react';
import { LoadingIndicator, Button, SegmentedTabs } from '@smarteam/ui';
import { useLeave } from '../../hooks/use-leave';
import { LeaveBalanceCards } from './leave-balance-cards';
import { LeaveApplicationsTable } from './leave-applications-table';
import { ApplyLeaveModal } from './apply-leave-modal';
import { LeaveExtrasPanel } from './leave-extras-panel';
import { PageShell } from '../layout/page-shell';

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending', tone: 'var(--warning, oklch(0.75 0.15 75))' },
  { id: 'APPROVED', label: 'Approved', tone: 'var(--success)' },
  { id: 'REJECTED', label: 'Rejected', tone: 'var(--destructive)' },
  { id: 'CANCELLED', label: 'Cancelled', tone: 'var(--muted-foreground)' },
];

/**
 * The employee's own leave.
 *
 * Balances, types and requests all come from the API. There is no fixture fallback: an empty
 * response renders an empty state and a failure renders an error, because a screen that invents
 * a balance is worse than one that admits it does not know.
 */
export function Screen7TimeOff() {
  const leave = useLeave();
  const [status, setStatus] = useState('ALL');
  const [view, setView] = useState<'leave' | 'history'>('leave');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string | null>(null);
  const [isApplyOpen, setIsApplyOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of leave.requests) {
      map.set(request.status, (map.get(request.status) ?? 0) + 1);
    }
    return map;
  }, [leave.requests]);

  const tabs = STATUS_FILTERS.map((filter) => ({
    ...filter,
    count: filter.id === 'ALL' ? leave.requests.length : (counts.get(filter.id) ?? 0),
  }));

  const visible = leave.requests.filter(
    (request) =>
      (status === 'ALL' || request.status === status) &&
      (!leaveTypeFilter || request.leaveTypeId === leaveTypeFilter),
  );

  return (
    <div className="flex w-full flex-col">
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        {/* Mobile View: Top action bar with page label on left and Apply button on top right */}
        <div className="flex items-center justify-between pt-2.5 pb-1 sm:hidden">
          <span className="text-sm font-bold text-foreground">Leave</span>
          <Button
            disabled={!leave.canWrite || leave.hasNoEmployeeRecord}
            onClick={() => setIsApplyOpen(true)}
            size="sm"
            type="button"
          >
            Apply for leave
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center sm:py-2.5">
          <SegmentedTabs
            aria-label="Leave sections"
            items={[
              { id: 'leave', label: 'My leave' },
              { id: 'history', label: `History (${leave.requests.length})` },
            ]}
            onValueChange={(value) => setView(value as 'leave' | 'history')}
            value={view}
          />
          <div className="hidden sm:flex shrink-0 items-center gap-2">
            <Button
              disabled={!leave.canWrite || leave.hasNoEmployeeRecord}
              onClick={() => setIsApplyOpen(true)}
              size="sm"
              type="button"
            >
              Apply for leave
            </Button>
          </div>
        </div>
      </div>

      <PageShell>
        {leave.hasNoEmployeeRecord && (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            This account has no employee record, so leave cannot be requested.
          </p>
        )}

        {leave.loading && (
          <LoadingIndicator variant="panel" label="Loading leave" className="py-10 text-center text-xs text-muted-foreground" />
        )}

        {!leave.loading && leave.forbidden && (
          <div
            className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
            role="status"
          >
            <p className="text-sm font-semibold text-foreground">Not available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You do not have permission to view leave.
            </p>
          </div>
        )}

        {!leave.loading && leave.error && !leave.forbidden && (
          <div
            className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
            role="alert"
          >
            <p className="text-sm font-semibold text-foreground">Could not load leave</p>
            <p className="mt-1 text-xs text-muted-foreground">{leave.error}</p>
            <Button
              className="mt-3"
              onClick={() => void leave.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        )}

        {!leave.loading && !leave.error && (
          <>
            {leave.saveError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {leave.saveError}
              </p>
            )}

            {view === 'leave' ? (
              <section aria-label="Leave balances" className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Balances</h2>
                <p className="text-xs text-muted-foreground">
                  Tap a balance to see matching requests in your history.
                </p>
                {leave.balances.length === 0 && leave.canReadBalances && (
                  <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                    No leave balances have been provisioned for you yet.
                  </p>
                )}
                <LeaveBalanceCards
                  balances={leave.balances}
                  onSelect={(leaveTypeId) => {
                    setLeaveTypeFilter(leaveTypeId);
                    setStatus('ALL');
                    setView('history');
                  }}
                  typesById={leave.typesById}
                />
                <LeaveExtrasPanel types={leave.types} />
              </section>
            ) : (
              <section aria-label="Leave request history" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Request history</h2>
                    {leaveTypeFilter && (
                      <button
                        className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setLeaveTypeFilter(null)}
                        type="button"
                      >
                        Clear {leave.typesById.get(leaveTypeFilter)?.name ?? 'leave'} filter
                      </button>
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <SegmentedTabs
                      aria-label="Filter leave requests by status"
                      items={tabs}
                      onValueChange={setStatus}
                      value={status}
                    />
                  </div>
                  <label className="min-w-0 sm:hidden">
                    <span className="sr-only">Filter leave requests by status</span>
                    <select
                      className="h-9 max-w-full rounded-md border border-input bg-input-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      onChange={(event) => setStatus(event.target.value)}
                      value={status}
                    >
                      {tabs.map((tab) => (
                        <option key={tab.id} value={tab.id}>
                          {tab.label} ({tab.count})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-8 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {leave.requests.length === 0
                        ? 'No leave requests yet'
                        : 'Nothing matches this filter'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {leave.requests.length === 0
                        ? 'Requests you submit will appear here.'
                        : 'Choose another status or clear the leave type filter.'}
                    </p>
                  </div>
                ) : (
                  <LeaveApplicationsTable
                    canWrite={leave.canWrite}
                    onCancel={leave.cancel}
                    requests={visible}
                    saving={leave.saving}
                    typesById={leave.typesById}
                  />
                )}
              </section>
            )}
          </>
        )}
      </PageShell>

      <ApplyLeaveModal
        balances={leave.balances}
        isOpen={isApplyOpen}
        onApply={leave.apply}
        onClose={() => setIsApplyOpen(false)}
        saveError={leave.saveError}
        saving={leave.saving}
        types={leave.types}
      />
    </div>
  );
}
