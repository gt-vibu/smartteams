'use client';
import { Button } from '@smarteam/ui';
import type { ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { downloadFile, toCsv } from '../../lib/csv';

export function ApprovalBatchProgress({ batch }: { batch: ApprovalInboxState['batch'] }) {
  if (!batch?.state && !batch?.error) return null;
  const state = batch.state;
  return (
    <section className="space-y-2 rounded-md border border-border p-3" aria-live="polite">
      {state && (
        <>
          <p className="text-xs font-semibold">
            {batch.running ? 'Processing approvals' : 'Batch result'}: {state.processed} of{' '}
            {state.total}
          </p>
          <progress
            className="w-full"
            value={state.processed}
            max={state.total}
            aria-label="Approval batch progress"
          />
          <p className="text-xs">
            {state.results.filter((row) => row.outcome === 'DECIDED').length} decisions recorded ·{' '}
            {state.results.filter((row) => row.outcome === 'FAILED').length} need attention
          </p>
          {state.results.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs">Individual results</summary>
              <div className="max-h-48 overflow-y-auto text-xs">
                {state.results.map((row) => (
                  <p
                    key={`${row.domain}-${row.id}`}
                    className={row.outcome === 'FAILED' ? 'text-destructive' : ''}
                  >
                    {row.label || `${row.domain} · ${row.id}`}: {row.message}
                  </p>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() =>
                  downloadFile(
                    'approval-results.csv',
                    toCsv([
                      ['Request ID', 'Type', 'Outcome', 'Status', 'Message'],
                      ...state.results.map((row) => [
                        row.id,
                        row.domain,
                        row.outcome,
                        row.status ?? '',
                        row.message,
                      ]),
                    ]),
                  )
                }
              >
                Download results
              </Button>
            </details>
          )}
        </>
      )}
      {(batch.error || state?.error) && (
        <p className="text-xs text-destructive" role="alert">
          {batch.error || state?.error}
        </p>
      )}
    </section>
  );
}
