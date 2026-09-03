'use client';

import React, { useMemo, useState } from 'react';
import { Button, SegmentedTabs } from '@smarteam/ui';
import { useLeave } from '../../hooks/use-leave';
import { LeaveBalanceCards } from './leave-balance-cards';
import { LeaveApplicationsTable } from './leave-applications-table';
import { ApplyLeaveModal } from './apply-leave-modal';

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

  const visible =
    status === 'ALL'
      ? leave.requests
      : leave.requests.filter((request) => request.status === status);

  return (
    <div className="flex w-full flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <SegmentedTabs
            aria-label="Filter leave requests by status"
            items={tabs}
            onValueChange={setStatus}
            value={status}
          />
          <div className="flex shrink-0 items-center gap-2 pb-2 sm:pb-0">
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

      <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 pb-6 pt-4 sm:px-6">
        {leave.hasNoEmployeeRecord && (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            This account has no employee record, so leave cannot be requested.
          </p>
        )}

        {leave.loading && (
          <p className="py-10 text-center text-xs text-muted-foreground" role="status">
            Loading leave...
          </p>
        )}

        {!leave.loading && leave.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
            <p className="text-sm font-semibold text-foreground">Not available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You do not have permission to view leave.
            </p>
          </div>
        )}

        {!leave.loading && leave.error && !leave.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
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
            {leave.balances.length === 0 && leave.canReadBalances && (
              <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                No leave balances have been provisioned for you yet.
              </p>
            )}

            <LeaveBalanceCards balances={leave.balances} typesById={leave.typesById} />

            {leave.saveError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {leave.saveError}
              </p>
            )}

            {visible.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {leave.requests.length === 0 ? 'No leave requests' : 'Nothing in this status'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {leave.requests.length === 0
                    ? 'Requests you submit will appear here.'
                    : 'Choose a different filter to see other requests.'}
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
          </>
        )}
      </div>

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
