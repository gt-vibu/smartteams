'use client';

import { approvalAnalyticsSchema } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { AlertTriangle, BarChart3, Check, Clock3, RefreshCw } from 'lucide-react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

const number = (value: number) => value.toLocaleString();

export function ApprovalAnalyticsPanel() {
  const { session } = useSession();
  const org = session?.organizationId;
  const feed = useAsyncResource(
    async () =>
      approvalAnalyticsSchema.parse(
        await apiRequest(orgPath(org!, '/approval-operations/analytics'), { method: 'GET' }),
      ),
    [org],
    { enabled: Boolean(org) },
  );

  return (
    <section aria-labelledby="approval-workload-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="approval-workload-title" className="text-lg font-semibold tracking-tight">
              Approval workload
            </h2>
            <p className="text-xs text-muted-foreground">
              Pending requests and decisions from the last 30 days
            </p>
          </div>
        </div>
        <Button
          aria-label="Refresh approval workload"
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
        <div aria-label="Loading approval workload" className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl border border-border/70 bg-card" />
          ))}
        </div>
      )}

      {feed.data && (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {feed.data.escalationDays > 0
              ? `Overdue after ${feed.data.escalationDays} days`
              : 'Overdue tracking is off'}
            <span aria-hidden="true">·</span>
            <span>Approved decisions · last 30 days</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {feed.data.rows.map((row) => {
              const title = row.domain === 'LEAVE' ? 'Leave requests' : 'Attendance corrections';
              return (
                <article
                  key={row.domain}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    {row.overdue > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle aria-hidden="true" className="size-3.5" />
                        {number(row.overdue)} overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                        <Check aria-hidden="true" className="size-3.5" />
                        On track
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-border/60 px-4 py-4">
                    <div className="pr-4">
                      <p className="text-xs text-muted-foreground">Awaiting a decision</p>
                      <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight">
                        {number(row.pending)}
                      </p>
                    </div>
                    <div className="pl-4">
                      <p className="text-xs text-muted-foreground">Oldest pending</p>
                      <p className="mt-2 text-sm font-medium tabular-nums">
                        {row.oldestAt ? new Date(row.oldestAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-border/60 bg-muted/30 p-3">
                    <div className="rounded-xl bg-background/70 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Automatic</p>
                      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                        {number(row.automatic)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background/70 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Manual</p>
                      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                        {number(row.manual)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!feed.data.rows.length && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
              <BarChart3 aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 font-medium">No workload data available</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account does not have access to organization-wide requests.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
