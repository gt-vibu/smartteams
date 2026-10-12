'use client';
import { WorkforceRetryPanel } from './workforce-retry-panel';
import { Button } from '@smarteam/ui';
import { useState } from 'react';
import type { useWorkforceJob } from '../../hooks/use-workforce-job';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { downloadFile } from '../../lib/csv';
import { orgPath } from '../../repositories/api-helpers';

export function WorkforceJobProgress({ job }: { job: ReturnType<typeof useWorkforceJob> }) {
  const { session } = useSession();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const state = job.state;
  if (!state && !job.error) return null;
  const exportResults = async () => {
    if (!state || !session) return;
    setDownloading(true);
    setError('');
    try {
      const csv = await apiRequest(
        orgPath(session.organizationId, `/workforce/jobs/${state.batchId}/results.csv`),
        { method: 'GET', responseType: 'text' },
      );
      if (typeof csv !== 'string') throw new Error('The result file could not be downloaded.');
      downloadFile(`assignments-${state.batchId}.csv`, csv);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not download results.');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className="space-y-2 rounded-md border border-border bg-background p-3">
      {state && (
        <>
          <p role="status" className="text-sm font-semibold">
            {job.active
              ? 'Applying assignments'
              : state.state === 'completed'
                ? 'Assignments finished'
                : 'Assignment job needs attention'}{' '}
            · {state.processed.toLocaleString()} / {state.total.toLocaleString()}
          </p>
          <progress
            aria-label="Assignment progress"
            value={state.processed}
            max={state.total}
            className="w-full"
          />
          <p className="text-xs">
            {state.applied.toLocaleString()} applied · {state.failed.toLocaleString()} need review.
            You can leave this page; progress is restored when you return.
          </p>
          <WorkforceRetryPanel key={state.batchId} job={job} />
          <details>
            <summary className="cursor-pointer text-xs">View individual results</summary>
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs">
              {state.results.map((row) => (
                <li key={row.id} className={row.outcome === 'FAILED' ? 'text-destructive' : ''}>
                  {row.name}: {row.message}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.offset > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={() => job.setOffset(0)}>
                  First results
                </Button>
              )}
              {state.nextOffset !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => job.setOffset(state.nextOffset!)}
                >
                  Next 100 results
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={downloading || !state.processed}
                onClick={() => void exportResults()}
              >
                {downloading ? 'Preparing download…' : 'Download all results'}
              </Button>
            </div>
          </details>
        </>
      )}
      {(job.error || state?.error || error) && (
        <p role="alert" className="text-xs text-destructive">
          {job.error || state?.error || error}
        </p>
      )}
    </section>
  );
}
