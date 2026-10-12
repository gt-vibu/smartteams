'use client';
import { workforceRetrySchema } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import type { useWorkforceJob } from '../../hooks/use-workforce-job';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

export function WorkforceRetryPanel({ job }: { job: ReturnType<typeof useWorkforceJob> }) {
  const { session } = useSession();
  const [value, setValue] = useState<ReturnType<typeof workforceRetrySchema.parse> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!job.state || job.active || (job.state.processed === job.state.total && !job.state.failed))
    return null;
  const check = async () => {
    if (!session || !job.state) return;
    setBusy(true);
    setError('');
    setValue(null);
    try {
      setValue(
        workforceRetrySchema.parse(
          await apiRequest(
            orgPath(session.organizationId, `/workforce/jobs/${job.state.batchId}/retry-preview`),
            { method: 'GET', timeoutMs: 60000 },
          ),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare a retry.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={busy || job.starting}
        onClick={() => void check()}
      >
        {busy ? 'Checking remaining assignments…' : 'Preview retry for failed or unfinished rows'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {value && (
        <>
          <p>
            {value.preview.targetName}: {value.preview.valid} ready to retry ·{' '}
            {value.preview.invalid} still need attention. Successful assignments are excluded.
          </p>
          <ul className="max-h-40 overflow-y-auto">
            {value.preview.rows
              .filter((row) => row.error)
              .map((row) => (
                <li key={row.id}>
                  {row.name}: {row.error}
                </li>
              ))}
          </ul>
          <Button
            size="sm"
            disabled={job.starting || !value.preview.valid}
            onClick={() => void job.start(value.input, value.preview.fingerprint)}
          >
            Apply previewed retry
          </Button>
          {value.preview.invalid > 0 && (
            <p>
              To change the target or effective date, use the staff setup form and preview a new
              selection.
            </p>
          )}
        </>
      )}
    </div>
  );
}
