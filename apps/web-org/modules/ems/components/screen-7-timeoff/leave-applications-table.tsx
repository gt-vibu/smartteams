'use client';

import React, { useState } from 'react';
import { Badge, Button, Input } from '@smarteam/ui';
import {
  formatDate,
  isCancellable,
  type LeaveRequest,
  type LeaveType,
  LIMITS,
} from '@smarteam/contracts';
import { statusLabel } from '../../lib/status-label';

/** Status tone. Restrained on purpose: the row is not recoloured, only the badge. */
function statusVariant(status: string): 'outline' | 'secondary' | 'destructive' {
  if (status === 'REJECTED') return 'destructive';
  if (status === 'APPROVED') return 'secondary';
  return 'outline';
}

export function LeaveApplicationsTable({
  requests,
  typesById,
  canWrite,
  saving,
  onCancel,
}: {
  requests: LeaveRequest[];
  typesById: Map<string, LeaveType>;
  canWrite: boolean;
  saving: boolean;
  onCancel: (requestId: string, reason: string) => Promise<boolean>;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submitCancel = async (requestId: string) => {
    // The API requires at least three characters and writes the reason to the audit trail.
    if (reason.trim().length < 3) {
      setError('A reason of at least three characters is required.');
      return;
    }
    setError('');
    const cancelled = await onCancel(requestId, reason.trim());
    if (cancelled) {
      setCancellingId(null);
      setReason('');
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 font-semibold">From</th>
            <th className="px-4 py-2.5 font-semibold">To</th>
            <th className="px-4 py-2.5 font-semibold">Days</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const type = typesById.get(request.leaveTypeId);
            const cancellable = canWrite && isCancellable(request);
            return (
              <React.Fragment key={request.id}>
                <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td data-cell="primary" className="px-4 py-2.5">
                    <span className="font-semibold text-foreground">{type?.name ?? 'Leave'}</span>
                    {type && !type.paid && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Unpaid</span>
                    )}
                    {request.decisionComment && (
                      <p className="mt-0.5 max-w-xs text-[11px] font-normal text-muted-foreground">
                        “{request.decisionComment}”
                      </p>
                    )}
                  </td>
                  <td
                    data-bare=""
                    data-label="From"
                    className="px-4 py-2.5 whitespace-nowrap text-muted-foreground"
                  >
                    {formatDate(request.startDate)}
                  </td>
                  <td
                    data-label="to"
                    className="px-4 py-2.5 whitespace-nowrap text-muted-foreground"
                  >
                    {formatDate(request.endDate)}
                  </td>
                  <td
                    data-label="Days"
                    className="px-4 py-2.5 font-semibold tabular-nums text-foreground"
                  >
                    {request.requestedDays}
                  </td>
                  <td data-cell="status" data-label="Status" className="px-4 py-2.5">
                    <Badge variant={statusVariant(request.status)}>
                      {statusLabel(request.status)}
                    </Badge>
                  </td>
                  <td data-cell="actions" className="px-4 py-2.5 text-right">
                    {cancellable && cancellingId !== request.id && (
                      <Button
                        onClick={() => {
                          setCancellingId(request.id);
                          setReason('');
                          setError('');
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>

                {cancellingId === request.id && (
                  <tr className="border-b border-border bg-muted/30">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          maxLength={LIMITS.reason}
                          aria-label="Cancellation reason"
                          className="max-w-sm"
                          disabled={saving}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Why is this being cancelled?"
                          value={reason}
                        />
                        <Button
                          disabled={saving}
                          onClick={() => void submitCancel(request.id)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          {saving ? 'Cancelling...' : 'Confirm cancellation'}
                        </Button>
                        <Button
                          disabled={saving}
                          onClick={() => setCancellingId(null)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Keep
                        </Button>
                        {error && (
                          <span className="text-[11px] font-medium text-destructive" role="alert">
                            {error}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
