'use client';
import { approvalAnalyticsSchema } from '@smarteam/contracts';
import { LoadingIndicator, Button } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

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
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Approval workload</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={feed.loading}
          onClick={() => void feed.refetch()}
        >
          Refresh
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pending totals include all authorized requests. Automation figures count approved stages in
        the last 30 days; one request may have several stages.
      </p>
      {feed.error && (
        <p role="alert" className="text-xs text-destructive">
          {feed.error}
        </p>
      )}
      {feed.loading && (
        <LoadingIndicator variant="inline" label="Loading workload" className="text-xs" />
      )}
      {feed.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {feed.data.escalationDays > 0
              ? `Overdue means waiting at least ${feed.data.escalationDays} days, using the configured escalation threshold.`
              : 'Escalation is disabled; overdue totals are not tracked.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {feed.data.rows.map((row) => (
              <div key={row.domain} className="space-y-2 rounded border border-border p-3 text-xs">
                <h3 className="font-semibold">
                  {row.domain === 'LEAVE' ? 'Leave requests' : 'Attendance corrections'}
                </h3>
                <p>
                  {row.pending.toLocaleString()} pending · {row.overdue.toLocaleString()} overdue
                </p>
                <p>
                  {row.automatic.toLocaleString()} automatically approved stages ·{' '}
                  {row.manual.toLocaleString()} manually approved stages
                </p>
                {row.oldestAt && (
                  <p className="text-muted-foreground">
                    Oldest pending request: {new Date(row.oldestAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
          {!feed.data.rows.length && (
            <p className="text-xs">
              You do not have access to organization-wide leave or attendance data.
            </p>
          )}
        </>
      )}
    </section>
  );
}
