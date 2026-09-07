'use client';

import React, { useState } from 'react';
import { Badge, Button, Input } from '@smarteam/ui';
import {
  dateKey,
  employeeDisplayName,
  type Employee,
  type LeaveRequest,
} from '@smarteam/contracts';
import type { LeaveAdminState } from '../../hooks/use-leave-admin';

function statusVariant(status: string): 'outline' | 'secondary' | 'destructive' {
  if (status === 'REJECTED') return 'destructive';
  if (status === 'APPROVED') return 'secondary';
  return 'outline';
}

/**
 * The organization-wide request queue, and the approve/reject action.
 *
 * `listRequests` and `decide` both existed on the API from the start, but no screen surfaced the
 * queue — a request could be filed and then never be seen or decided from inside the app.
 *
 * A decision needs a comment: the API rejects anything under two characters and writes it to the
 * audit trail, so the field is required here rather than sent as an empty string.
 */
export function LeaveRequestQueue({
  admin,
  requests,
}: {
  admin: LeaveAdminState;
  requests: LeaveRequest[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const employeesById = new Map<string, Employee>(
    admin.employees.map((employee) => [employee.id, employee]),
  );
  const typesById = new Map(admin.types.map((type) => [type.id, type]));
  const inboxIds = new Set(admin.inbox.map((entry) => entry.id));

  const decide = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    if (comment.trim().length < 2) {
      setError('A comment is required, and is recorded in the audit trail.');
      return;
    }
    setError('');
    const decided = await admin.decide(requestId, status, comment.trim());
    if (decided) {
      setActiveId(null);
      setComment('');
    }
  };

  if (requests.length === 0) {
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-semibold text-foreground">No leave requests</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Requests submitted by employees will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-semibold">Employee</th>
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 font-semibold">From</th>
            <th className="px-4 py-2.5 font-semibold">To</th>
            <th className="px-4 py-2.5 font-semibold">Days</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Decision</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const employee = employeesById.get(request.employeeId);
            const type = typesById.get(request.leaveTypeId);
            const mine = inboxIds.has(request.id);
            return (
              <React.Fragment key={request.id}>
                <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold text-foreground">
                      {employee ? employeeDisplayName(employee) : 'Not in the directory'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {employee?.employeeNumber ?? '--'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {type?.name ?? 'Leave'}
                    {type && !type.paid && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Unpaid</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                    {dateKey(request.startDate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                    {dateKey(request.endDate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold tabular-nums text-foreground">
                    {request.requestedDays}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {request.status === 'PENDING' && admin.canDecide && activeId !== request.id && (
                      <Button
                        disabled={!mine}
                        onClick={() => {
                          setActiveId(request.id);
                          setComment('');
                          setError('');
                        }}
                        size="sm"
                        title={mine ? undefined : 'This request is not awaiting your decision.'}
                        type="button"
                        variant="outline"
                      >
                        Decide
                      </Button>
                    )}
                  </td>
                </tr>

                {activeId === request.id && (
                  <tr className="border-b border-border bg-muted/30">
                    <td className="px-4 py-3" colSpan={7}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label="Decision comment"
                          className="max-w-sm"
                          disabled={admin.saving}
                          onChange={(event) => setComment(event.target.value)}
                          placeholder="Comment (recorded in the audit trail)"
                          value={comment}
                        />
                        <Button
                          disabled={admin.saving}
                          onClick={() => void decide(request.id, 'APPROVED')}
                          size="sm"
                          type="button"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={admin.saving}
                          onClick={() => void decide(request.id, 'REJECTED')}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={admin.saving}
                          onClick={() => setActiveId(null)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                        {(error || admin.saveError) && (
                          <span className="text-[11px] font-medium text-destructive" role="alert">
                            {error || admin.saveError}
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
