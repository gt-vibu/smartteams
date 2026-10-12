'use client';

import {
  dateKey,
  employeeDisplayName,
  entitlementOf,
  LIMITS,
  type Employee,
  type LeaveRequest,
} from '@smarteam/contracts';
import { Badge, Button, Dialog, DialogContent, DialogTitle, Input } from '@smarteam/ui';
import React, { useState } from 'react';
import { leaveAdminBusyKey, type LeaveAdminState } from '../../hooks/use-leave-admin';
import { statusLabel } from '../../lib/status-label';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { leaveRepository } from '../../repositories/leave.repository';

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
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const type = admin.types.find((entry) => entry.id === request.leaveTypeId);
  const balances = useAsyncResource(
    () => leaveRepository.listBalances(admin.organizationId!, request.employeeId),
    [admin.organizationId, request.employeeId],
    { enabled: Boolean(admin.organizationId) && admin.canReadBalances },
  );
  const balance = (balances.data ?? admin.balances).find(
    (entry) => entry.employeeId === request.employeeId && entry.leaveTypeId === request.leaveTypeId,
  );
  const mine = admin.inbox.some((entry) => entry.id === request.id);
  const busy = admin.isBusy(leaveAdminBusyKey.decide(request.id));
  const decidable = request.status === 'PENDING' && admin.canDecide && mine;

  const approve = async () => {
    setError('');
    if (await admin.decide(request.id, 'APPROVED', '')) onClose();
  };

  const reject = async () => {
    if (rejectionReason.trim().length < 2) {
      setError('A reason is required when rejecting a request.');
      return;
    }
    setError('');
    if (await admin.decide(request.id, 'REJECTED', rejectionReason.trim())) onClose();
  };

  const facts: Array<[string, React.ReactNode]> = [
    ['Employee', employee ? employeeDisplayName(employee) : (request.employeeName ?? 'Employee')],
    ['Employee ID', employee?.employeeNumber ?? request.employeeNumber ?? '—'],
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
            {statusLabel(request.status)}
          </Badge>
        </DialogTitle>

        <div className="mt-3 space-y-3 text-xs">
          {balances.error && (
            <p role="alert" className="text-destructive">
              Could not load this employee’s balance. {balances.error}
            </p>
          )}
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
              {rejecting ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-destructive">
                    Please state the reason for rejection:
                  </p>
                  <Input
                    maxLength={LIMITS.reason}
                    aria-label="Rejection reason"
                    disabled={busy}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Reason for rejection (required)"
                    value={rejectionReason}
                    autoFocus
                  />
                  {(error || admin.saveError) && (
                    <p className="font-medium text-destructive" role="alert">
                      {error || admin.saveError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setRejecting(false);
                        setError('');
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void reject()}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {admin.saveError && (
                    <p className="font-medium text-destructive" role="alert">
                      {admin.saveError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button disabled={busy} onClick={() => void approve()} size="sm" type="button">
                      Approve
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Reject
                    </Button>
                  </div>
                </>
              )}
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
