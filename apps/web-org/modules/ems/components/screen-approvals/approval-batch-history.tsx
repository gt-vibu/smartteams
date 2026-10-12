'use client';
import { approvalBatchHistorySchema } from '@smarteam/contracts';
import { LoadingIndicator, Button } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

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
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Your approval batches</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={feed.loading}
          onClick={() => void feed.refetch()}
        >
          Refresh batches
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Recent batches you started are retained here for seven days. Batch errors and
        individual request failures need review in My approvals; completed decisions stay in the
        audit history.
      </p>
      {feed.error && (
        <p role="alert" className="text-xs text-destructive">
          {feed.error}
        </p>
      )}
      {feed.loading && (
        <LoadingIndicator variant="inline" label="Loading batches" className="text-xs" />
      )}
      <ul className="space-y-2 text-xs">
        {feed.data?.items.map((item) => (
          <li key={item.batchId} className="rounded border border-border p-2">
            <p>
              {new Date(item.createdAt).toLocaleString()} · {item.state} · {item.processed}/
              {item.total} processed · {item.failed} need attention
            </p>
            {item.error && <p className="text-destructive">{item.error}</p>}
            <p className="mt-1 break-all font-mono text-muted-foreground">{item.batchId}</p>
          </li>
        ))}
      </ul>
      {!feed.loading && !feed.error && !feed.data?.items.length && (
        <p className="text-xs text-muted-foreground">No retained approval batches.</p>
      )}
      <div className="flex gap-2">
        {offset > 0 && (
          <Button size="sm" variant="outline" onClick={() => setOffset(0)}>
            First batches
          </Button>
        )}
        {feed.data?.nextOffset != null && (
          <Button size="sm" variant="outline" onClick={() => setOffset(feed.data!.nextOffset!)}>
            Next 10 batches
          </Button>
        )}
      </div>
    </section>
  );
}
