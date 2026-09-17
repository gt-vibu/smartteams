'use client';

import React, { useState } from 'react';
import { Badge, Button, Label, Textarea } from '@smarteam/ui';
import type { AttendanceCorrection } from '@smarteam/contracts';
import type { AttendanceAdminState } from '../../hooks/use-attendance-admin';

/**
 * The correction queue, and the approve/reject action.
 *
 * `decideCorrection` has always existed on the API, and `listCorrectionRequests` was reachable
 * over federation, but no screen surfaced either — a correction could be raised and then never
 * be seen or decided from inside the app.
 *
 * A decision needs a comment; the API rejects anything under two characters and writes it to the
 * audit trail, so the field is required here rather than sent as an empty string.
 */
export function AttendanceCorrectionsPanel({ admin }: { admin: AttendanceAdminState }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const decide = async (correctionId: string, status: 'APPROVED' | 'REJECTED') => {
    if (comment.trim().length < 2) {
      setError('A comment is required, and is recorded in the audit trail.');
      return;
    }
    setError('');
    const decided = await admin.decide(correctionId, status, comment.trim());
    if (decided) {
      setActiveId(null);
      setComment('');
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
          return (
            <div className="px-4 py-3" key={correction.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {correction.workDate?.slice(0, 10) ?? 'Unknown date'}
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
                      Step {approval.stepNumber}: {approval.status}
                      {approval.comment ? ` — ${approval.comment}` : ''}
                    </p>
                  ))}
                </div>
                <Badge variant={isPending ? 'outline' : 'secondary'}>{correction.status}</Badge>
              </div>

              {isPending && admin.canDecide && (
                <div className="mt-2">
                  {activeId === correction.id ? (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <Label className="block" htmlFor={`decision-${correction.id}`}>
                        Decision comment
                      </Label>
                      <Textarea
                        disabled={admin.saving}
                        id={`decision-${correction.id}`}
                        onChange={(event) => setComment(event.target.value)}
                        rows={2}
                        value={comment}
                      />
                      <p className="text-[11px] font-semibold text-destructive" role="alert">
                        {error || admin.saveError}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={admin.saving}
                          onClick={() => void decide(correction.id, 'APPROVED')}
                          size="sm"
                          type="button"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={admin.saving}
                          onClick={() => void decide(correction.id, 'REJECTED')}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={admin.saving}
                          onClick={() => {
                            setActiveId(null);
                            setComment('');
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
                    <Button
                      onClick={() => {
                        setActiveId(correction.id);
                        setComment('');
                        setError('');
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Decide
                    </Button>
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
