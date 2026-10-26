'use client';

import { approvalBatchHistorySchema } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

function batchStateLabel(state: string) {
  if (state === 'completed') return 'Complete';
  if (state === 'failed') return 'Failed';
  if (state === 'active') return 'In progress';
  if (state === 'waiting' || state === 'delayed') return 'Queued';
  return state.replaceAll('_', ' ');
}

export function ApprovalBatchHistory() {
  const { session } = useSession();
  const org = session?.organizationId;
  const [offset, setOffset] = useState(0);
  const feed = useAsyncResource(
    async () =>
      approvalBatchHistorySchema.parse(
        await apiRequest(orgPath(org!, `/approval-batches/history?offset=${offset}`), {
          method: 'GET',
        }),
      ),
    [org, offset],
    { enabled: Boolean(org) },
  );

  return (
    <section aria-labelledby="approval-batches-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <ClipboardList aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="approval-batches-title" className="text-lg font-semibold tracking-tight">
              Recent batch actions
            </h2>
            <p className="text-xs text-muted-foreground">Your decisions from the past 7 days</p>
          </div>
        </div>
        <Button
          aria-label="Refresh recent batch actions"
          size="sm"
          variant="outline"
          disabled={feed.loading}
          onClick={() => void feed.refetch()}
        >
          <RefreshCw aria-hidden="true" className={`mr-2 size-4 ${feed.loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {feed.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{feed.error}</span>
        </div>
      )}

      {feed.loading && !feed.data && (
        <div aria-label="Loading batch actions" className="space-y-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-xl border border-border/70 bg-card" />
          ))}
        </div>
      )}

      {feed.data && feed.data.items.length > 0 && (
        <>
          <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            {feed.data.items.map((item, index) => {
              const complete = item.state === 'completed';
              const failed = item.state === 'failed' || item.failed > 0 || Boolean(item.error);
              const progress = item.total > 0 ? Math.min(100, (item.processed / item.total) * 100) : 0;
              return (
                <li
                  key={item.batchId}
                  className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${index ? 'border-t border-border/60' : ''}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${failed ? 'bg-destructive/10 text-destructive' : complete ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}
                    >
                      {failed ? (
                        <AlertTriangle aria-hidden="true" className="size-4" />
                      ) : complete ? (
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                      ) : (
                        <Clock3 aria-hidden="true" className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{batchStateLabel(item.state)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.processed} of {item.total} processed</span>
                        {item.failed > 0 && (
                          <span className="font-medium text-destructive">{item.failed} need attention</span>
                        )}
                      </div>
                      <div
                        aria-label={`${Math.round(progress)}% processed`}
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] ${failed ? 'bg-destructive' : 'bg-primary'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
                    </div>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${failed ? 'bg-destructive/10 text-destructive' : complete ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                  >
                    {item.failed ? `${item.failed} failed` : batchStateLabel(item.state)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            {offset > 0 && (
              <Button size="sm" variant="outline" onClick={() => setOffset(0)}>
                Newest
              </Button>
            )}
            {feed.data.nextOffset != null && (
              <Button size="sm" variant="outline" onClick={() => setOffset(feed.data!.nextOffset!)}>
                Older actions
              </Button>
            )}
          </div>
        </>
      )}

      {!feed.loading && !feed.error && !feed.data?.items.length && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-9 text-center">
          <ClipboardList aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-medium">No recent batch actions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Decisions you process together will appear here for seven days.
          </p>
        </div>
      )}
    </section>
  );
}
