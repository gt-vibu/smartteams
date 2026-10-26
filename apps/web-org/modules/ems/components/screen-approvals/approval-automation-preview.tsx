'use client';
import {
  existingAutomationResultSchema,
  approvalAutomationPreviewSchema as resultSchema,
  type ApprovalAutomation,
  type ApprovalDomain,
  type ApprovalAutomationPreviewResult as Preview,
} from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { emitDataChanged } from '../../lib/data-events';
import { orgPath } from '../../repositories/api-helpers';

export function ApprovalAutomationPreview({
  value,
  domain,
  disabled,
}: {
  value: ApprovalAutomation;
  domain: ApprovalDomain;
  disabled: boolean;
}) {
  const { session } = useSession();
  const [result, setResult] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [applied, setApplied] = useState<Array<{ id: string; outcome: string; message: string }>>(
    [],
  );
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null);
    setConfirmed(false);
    setApplied([]);
    setError('');
    setLoading(false);
  }, [value, domain]);
  const preview = async (cursor?: string) => {
    if (!session?.organizationId) return;
    const current = revision.current;
    setLoading(true);
    setError('');
    try {
      const data = resultSchema.parse(
        await apiRequest(orgPath(session.organizationId, '/approval-policies/automation-preview'), {
          method: 'POST',
          body: { domain, automation: value, ...(cursor ? { cursor } : {}) },
        }),
      );
      if (current === revision.current)
        setResult((previous) =>
          cursor && previous
            ? {
                ...data,
                processed: previous.processed + data.processed,
                eligible: previous.eligible + data.eligible,
                manual: previous.manual + data.manual,
                examples: [...previous.examples, ...data.examples],
              }
            : data,
        );
    } catch (caught) {
      if (current === revision.current)
        setError(caught instanceof Error ? caught.message : 'Could not preview these rules.');
    } finally {
      if (current === revision.current) setLoading(false);
    }
  };
  const applyExisting = async () => {
    if (!session?.organizationId || !result || !confirmed) return;
    const ids = result.examples
      .filter((row) => row.eligible)
      .slice(0, 100)
      .map((row) => row.id);
    setLoading(true);
    setError('');
    try {
      const data = existingAutomationResultSchema.parse(
        await apiRequest(
          orgPath(session.organizationId, '/approval-policies/automation-apply-existing'),
          {
            method: 'POST',
            body: { domain, automation: value, ids, reason },
          },
        ),
      );
      setApplied(data.results);
      setConfirmed(false);
      const handled = new Set(data.results.map((row) => row.id));
      setResult((previous) =>
        previous
          ? {
              ...previous,
              examples: previous.examples.filter((row) => !handled.has(row.id)),
              eligible: Math.max(0, previous.eligible - ids.length),
            }
          : null,
      );
      emitDataChanged('approvals', 'leave', 'attendance', 'payroll');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply rules.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={() => void preview()}
      >
        {loading ? 'Checking requests…' : 'Preview rule impact'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Compare these rules with current pending requests. This preview records no decisions; saving
        applies to new requests.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {applied.length > 0 && (
        <div aria-live="polite" className="max-h-40 overflow-y-auto text-xs">
          {applied.map((row) => (
            <p key={row.id}>
              {row.outcome}: {row.id} — {row.message}
            </p>
          ))}
        </div>
      )}
      {result && (
        <div className="space-y-2 text-xs" aria-live="polite">
          <p>
            {result.processed} checked · {result.eligible} eligible · {result.manual} need manual
            review
          </p>
          {result.nextCursor && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void preview(result.nextCursor!)}
            >
              Check next 100
            </Button>
          )}
          {result.eligible > 0 && (
            <div className="space-y-2 rounded border p-3">
              <p>
                Apply the displayed rules to up to 100 eligible existing requests per action. Each
                request is checked again; exceptions remain for review. This records system
                approvals immediately.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={loading}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Approve eligible existing requests with these rules
              </label>
              <label className="block">
                Reason for applying rules
                <input
                  className="mt-1 block w-full rounded border bg-background p-2"
                  value={reason}
                  maxLength={500}
                  disabled={loading}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={disabled || loading || !confirmed || reason.trim().length < 3}
                onClick={() => void applyExisting()}
              >
                Approve {Math.min(100, result.eligible)} eligible existing requests
              </Button>
            </div>
          )}
          <details>
            <summary className="cursor-pointer">Request results</summary>
            <div className="max-h-40 overflow-y-auto">
              {result.examples.map((row) => (
                <p key={row.id}>
                  {row.id}: {row.reason}
                </p>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
