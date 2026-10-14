'use client';
import {
  cancellationInboxSchema,
  formatDateRange,
  leaveWorkflowSettingsSchema,
  type LeaveWorkflowSettings,
} from '@smarteam/contracts';
import { LoadingIndicator, Button, Input, Label } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { emitDataChanged } from '../../lib/data-events';
import { orgPath } from '../../repositories/api-helpers';

export function LeaveCancellationsPanel() {
  const { session, hasPermission } = useSession();
  const org = session?.organizationId;
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feed = useAsyncResource(
    async () =>
      cancellationInboxSchema.parse(
        await apiRequest(
          orgPath(org!, `/leave/workflows/cancellations${cursor ? `?cursor=${cursor}` : ''}`),
          { method: 'GET' },
        ),
      ),
    [org, cursor],
    { enabled: Boolean(org) },
  );
  const [rules, setRules] = useState<LeaveWorkflowSettings | null>(null);
  const settings = useAsyncResource(
    async () =>
      leaveWorkflowSettingsSchema.parse(
        await apiRequest(orgPath(org!, '/leave/workflows/settings'), { method: 'GET' }),
      ),
    [org],
    { enabled: Boolean(org) && hasPermission('leave.types.write') },
  );
  const current = rules ?? settings.data;
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      emitDataChanged('leave', 'approvals', 'payroll');
      await feed.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this decision.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Approved leave cancellations</h2>
      <p className="text-xs text-muted-foreground">
        Leave remains approved and its balance stays used until HR accepts cancellation. Released
        payroll requires a correction run first. You cannot review your own cancellation.
      </p>
      {hasPermission('leave.types.write') && current && (
        <details className="rounded-md border border-border p-3">
          <summary className="text-xs font-semibold">Cancellation settings</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs">
              Before leave starts
              <select
                aria-label="Future leave cancellation"
                value={current.futureCancellation}
                disabled={busy}
                className="mt-1 w-full rounded border border-border bg-background p-2"
                onChange={(event) =>
                  setRules({
                    ...current,
                    futureCancellation: event.target
                      .value as LeaveWorkflowSettings['futureCancellation'],
                  })
                }
              >
                <option value="IMMEDIATE">Immediate cancellation</option>
                <option value="REVIEW">HR review required</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <label className="text-xs">
              After leave starts
              <select
                aria-label="Started leave cancellation"
                value={current.startedCancellation}
                disabled={busy}
                className="mt-1 w-full rounded border border-border bg-background p-2"
                onChange={(event) =>
                  setRules({
                    ...current,
                    startedCancellation: event.target
                      .value as LeaveWorkflowSettings['startedCancellation'],
                  })
                }
              >
                <option value="REVIEW">HR review required</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <div>
              <Label htmlFor="cancel-notice">Days of notice for immediate cancellation</Label>
              <Input
                id="cancel-notice"
                type="number"
                min={0}
                max={365}
                value={current.minimumNoticeDays}
                disabled={busy}
                onChange={(event) =>
                  setRules({ ...current, minimumNoticeDays: Number(event.target.value) })
                }
              />
            </div>
          </div>
          <p className="my-2 text-xs text-muted-foreground">
            Requests inside the notice window go to HR review. Withdrawing pending leave is always
            immediate.
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(() =>
                apiRequest(orgPath(org!, '/leave/workflows/settings'), {
                  method: 'PUT',
                  body: current,
                }),
              )
            }
          >
            Save cancellation settings
          </Button>
        </details>
      )}
      {(error || feed.error || settings.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || feed.error || settings.error}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={busy || feed.loading}
        onClick={() => void feed.refetch()}
      >
        Refresh requests
      </Button>
      {feed.loading && (
        <LoadingIndicator variant="inline" label="Loading cancellation requests" className="text-xs" />
      )}
      {feed.data?.items.length === 0 && (
        <p className="text-xs">No cancellations awaiting your review on this page.</p>
      )}
      {feed.data?.items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"
        >
          <div className="text-xs">
            <p className="font-semibold">
              {item.name} · {item.leaveType}
            </p>
            <p>{formatDateRange(item.startDate, item.endDate)}</p>
            <p className="mt-1 text-muted-foreground">{item.cancellation.reason}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  apiRequest(orgPath(org!, `/leave/workflows/cancellations/${item.id}/decision`), {
                    method: 'POST',
                    body: { status: 'APPROVED' },
                  }),
                )
              }
            >
              Approve cancellation
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  apiRequest(orgPath(org!, `/leave/workflows/cancellations/${item.id}/decision`), {
                    method: 'POST',
                    body: { status: 'REJECTED' },
                  }),
                )
              }
            >
              Reject cancellation
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!cursor || busy}
          onClick={() => setCursor(null)}
        >
          First page
        </Button>
        {feed.data?.nextCursor && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setCursor(feed.data!.nextCursor)}
          >
            Next page
          </Button>
        )}
      </div>
    </section>
  );
}
