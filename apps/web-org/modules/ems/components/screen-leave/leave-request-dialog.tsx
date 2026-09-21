'use client';

import React, { useState } from 'react';
import { Badge, Button, Dialog, DialogContent, DialogTitle, Input } from '@smarteam/ui';
import {
  dateKey,
  employeeDisplayName,
  entitlementOf,
  type Employee,
  type LeaveRequest,
} from '@smarteam/contracts';
import { leaveAdminBusyKey, type LeaveAdminState } from '../../hooks/use-leave-admin';

/**
 * One leave request in full: who asked, for which type and dates, how many days it costs, what
 * they said, and what is left of that balance. A request awaiting this approver's decision can be
 * approved or rejected here, with the comment the audit trail records.
 */
export function LeaveRequestDialog({
  admin,
  request,
  employee,
  onClose,
}: {
  admin: LeaveAdminState;
  request: LeaveRequest;
  employee: Employee | undefined;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const type = admin.types.find((entry) => entry.id === request.leaveTypeId);
  const balance = admin.balances.find(
    (entry) => entry.employeeId === request.employeeId && entry.leaveTypeId === request.leaveTypeId,
  );
  const mine = admin.inbox.some((entry) => entry.id === request.id);
  const busy = admin.isBusy(leaveAdminBusyKey.decide(request.id));
  const decidable = request.status === 'PENDING' && admin.canDecide && mine;

  const decide = async (status: 'APPROVED' | 'REJECTED') => {
    if (comment.trim().length < 2) {
      setError('A comment is required, and is recorded in the audit trail.');
      return;
    }
    setError('');
    if (await admin.decide(request.id, status, comment.trim())) onClose();
  };

  const facts: Array<[string, React.ReactNode]> = [
    ['Employee', employee ? employeeDisplayName(employee) : 'Not in the directory'],
    ['Employee ID', employee?.employeeNumber ?? '—'],
    ['Leave type', `${type?.name ?? 'Leave'}${type && !type.paid ? ' (unpaid)' : ''}`],
    ['From', dateKey(request.startDate)],
    ['To', dateKey(request.endDate)],
    ['Days', `${request.requestedDays} working day${request.requestedDays === 1 ? '' : 's'}`],
  ];
  if (balance)
    facts.push([
      'Balance for this type',
      `${balance.availableAmount} left of ${entitlementOf(balance)} · ${balance.usedAmount} used · ${balance.reservedAmount} pending`,
    ]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-lg">
        <DialogTitle className="flex items-center gap-2">
          Leave request
          <Badge
            variant={
              request.status === 'REJECTED'
                ? 'destructive'
                : request.status === 'APPROVED'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {request.status}
          </Badge>
        </DialogTitle>

        <div className="mt-3 space-y-3 text-xs">
          <div className="space-y-1.5 rounded-md border border-border p-3">
            {facts.map(([label, value]) => (
              <div className="flex justify-between gap-3" key={label}>
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Reason
            </p>
            <p className="rounded-md bg-muted/40 p-3 text-foreground">
              {request.reason?.trim() ? request.reason : 'No reason was given.'}
            </p>
          </div>

          {request.status === 'PENDING' && !mine && admin.canDecide && (
            <p className="text-muted-foreground">This request is not awaiting your decision.</p>
          )}

          {decidable && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Input
                aria-label="Decision comment"
                disabled={busy}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Comment (recorded in the audit trail)"
                value={comment}
              />
              {(error || admin.saveError) && (
                <p className="font-medium text-destructive" role="alert">
                  {error || admin.saveError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void decide('APPROVED')}
                  size="sm"
                  type="button"
                >
                  Approve
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void decide('REJECTED')}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Reject
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={onClose} size="sm" type="button" variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
