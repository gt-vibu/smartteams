'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import { formatMoney, type SalaryAdvance } from '@smarteam/contracts';

/**
 * Salary advances.
 *
 * A request is a real mutation: the screen this replaced pushed a `REQUESTED` row into component
 * state, so the advance existed only in the browser that asked for it — invisible to the
 * approver, and invisible to payroll, which recovers approved advances from net pay.
 */

export function PayrollAdvancesPanel({
  advances,
  canRequest,
  onRequest,
  saving,
  saveError,
}: {
  advances: SalaryAdvance[];
  canRequest: boolean;
  onRequest: (input: { requestedAmount: number; reason: string }) => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || reason.trim().length < 3)
      return;
    const ok = await onRequest({ requestedAmount, reason: reason.trim() });
    if (ok) {
      setAmount('');
      setReason('');
      setOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Approved advances are recovered from net pay by the payroll run.
        </p>
        {canRequest && (
          <Button onClick={() => setOpen(true)} size="sm" type="button">
            Request advance
          </Button>
        )}
      </div>

      {saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {saveError}
        </p>
      )}

      {advances.length === 0 ? (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-bold text-foreground">No salary advances</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing has been requested or recovered.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="stack-table w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border bg-table-header">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Requested</th>
                <th className="px-4 py-2.5 font-bold">Amount</th>
                <th className="px-4 py-2.5 font-bold">Approved</th>
                <th className="px-4 py-2.5 font-bold">Recovered</th>
                <th className="px-4 py-2.5 font-bold">Reason</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((advance) => (
                <tr
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  key={advance.id}
                >
                  <td
                    data-label="Requested"
                    className="px-4 py-2.5 font-mono text-muted-foreground"
                  >
                    {advance.requestedAt.slice(0, 10)}
                  </td>
                  <td data-label="Amount" className="px-4 py-2.5 font-mono text-foreground">
                    {formatMoney(advance.requestedAmount)}
                  </td>
                  <td data-label="Approved" className="px-4 py-2.5 font-mono text-muted-foreground">
                    {advance.approvedAmount === null || advance.approvedAmount === undefined
                      ? '--'
                      : formatMoney(advance.approvedAmount)}
                  </td>
                  <td
                    data-label="Recovered"
                    className="px-4 py-2.5 font-mono text-muted-foreground"
                  >
                    {formatMoney(advance.recoveredAmount)}
                  </td>
                  <td data-label="Reason" className="px-4 py-2.5 text-muted-foreground">
                    {advance.reason ?? '--'}
                  </td>
                  <td data-label="Status" className="px-4 py-2.5">
                    <Badge variant={advance.status === 'APPROVED' ? 'success' : 'secondary'}>
                      {advance.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Request a salary advance</DialogTitle>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div>
              <Label className="mb-1 block" htmlFor="advance-amount">
                Amount
              </Label>
              <Input
                disabled={saving}
                id="advance-amount"
                inputMode="decimal"
                min="1"
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                value={amount}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="advance-reason">
                Reason
              </Label>
              <Textarea
                disabled={saving}
                id="advance-reason"
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                disabled={saving}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? 'Requesting...' : 'Request'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
