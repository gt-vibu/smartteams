'use client';

import type { AttendanceCorrection } from '@smarteam/contracts';
import { formatDate, LIMITS } from '@smarteam/contracts';
import { Badge, Button, Label, Textarea } from '@smarteam/ui';
import { useState } from 'react';
import type { AttendanceAdminState } from '../../hooks/use-attendance-admin';
import { statusLabel } from '../../lib/status-label';

/**
 * The correction queue, and the approve/reject action.
 *
 * Approvals execute immediately without requiring comments.
 * Rejections require a clear reason recorded in the audit trail.
 */
export function AttendanceCorrectionsPanel({ admin }: { admin: AttendanceAdminState }) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');

  const approve = async (correctionId: string) => {
    setError('');
    await admin.decide(correctionId, 'APPROVED', '');
  };

  const reject = async (correctionId: string) => {
    if (rejectionReason.trim().length < 2) {
      setError('A reason is required when rejecting a correction.');
      return;
    }
    setError('');
    const decided = await admin.decide(correctionId, 'REJECTED', rejectionReason.trim());
    if (decided) {
      setRejectingId(null);
      setRejectionReason('');
    }
  };

  const rows: AttendanceCorrection[] = admin.corrections;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Correction requests
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {admin.inbox.length} awaiting your decision
          </p>
        </div>
        {!admin.canDecide && (
          <span className="text-[11px] text-muted-foreground">
            You can view these but not decide them.
          </span>
        )}
      </header>

      <div className="divide-y divide-border">
        {rows.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No correction requests.
          </p>
        )}

        {rows.map((correction) => {
          const isPending = correction.status === 'PENDING';
          const isRejecting = rejectingId === correction.id;
          return (
            <div className="px-4 py-3" key={correction.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {formatDate(correction.workDate) || 'Unknown date'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {correction.employee
                      ? `${correction.employee.firstName} ${correction.employee.lastName} · ${correction.employee.employeeNumber}`
                      : 'Employee not in the directory'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {correction.reason ?? 'No reason recorded'}
                  </p>
                  {correction.approvals?.map((approval) => (
                    <p
                      className="mt-1 text-[11px] text-muted-foreground"
                      key={`${correction.id}-${approval.stepNumber}`}
                    >
                      Step {approval.stepNumber}: {statusLabel(approval.status)}
                      {approval.comment ? ` — ${approval.comment}` : ''}
                    </p>
                  ))}
                </div>
                <Badge variant={isPending ? 'outline' : 'secondary'}>
                  {statusLabel(correction.status)}
                </Badge>
              </div>

              {isPending &&
                admin.canDecide &&
                admin.inbox.some((item) => item.id === correction.id) && (
                  <div className="mt-2">
                    {isRejecting ? (
                      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                        <Label
                          className="block text-xs font-medium text-destructive"
                          htmlFor={`rejection-${correction.id}`}
                        >
                          Reason for rejection (required)
                        </Label>
                        <Textarea
                          maxLength={LIMITS.reason}
                          disabled={admin.saving}
                          id={`rejection-${correction.id}`}
                          onChange={(event) => setRejectionReason(event.target.value)}
                          placeholder="State the reason for rejection..."
                          rows={2}
                          value={rejectionReason}
                          autoFocus
                        />
                        {(error || admin.saveError) && (
                          <p className="text-[11px] font-semibold text-destructive" role="alert">
                            {error || admin.saveError}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            disabled={admin.saving}
                            onClick={() => void reject(correction.id)}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            Confirm Rejection
                          </Button>
                          <Button
                            disabled={admin.saving}
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason('');
                              setError('');
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={admin.saving}
                          onClick={() => void approve(correction.id)}
                          size="sm"
                          type="button"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={admin.saving}
                          onClick={() => {
                            setRejectingId(correction.id);
                            setRejectionReason('');
                            setError('');
                          }}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
