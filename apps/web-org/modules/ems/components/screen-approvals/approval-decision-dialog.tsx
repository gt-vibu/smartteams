'use client';
import { formatDateTime } from '@smarteam/contracts';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  TimePicker,
} from '@smarteam/ui';
import type { useApprovalQueueController } from './use-approval-queue-controller';

export function ApprovalDecisionDialog({
  controller,
}: {
  controller: ReturnType<typeof useApprovalQueueController>;
}) {
  const c = controller;
  const approving = c.deciding?.status === 'APPROVED';
  return (
    <Dialog
      open={c.deciding !== null}
      onOpenChange={(open) => {
        if (!open && !c.busy) c.setDeciding(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle>
          {approving
            ? 'Approve check-out time'
            : `Reject ${c.single ? 'this request' : `${c.deciding?.items.length ?? 0} requests`}`}
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          {approving
            ? 'Review or adjust the check-out time before approving.'
            : 'The request will be rejected and the decision recorded in the audit trail.'}
        </p>
        <div className="space-y-3">
          {approving && c.single?.proposedCheckOut && (
            <>
              <p className="text-xs">
                {c.single.autoClosed
                  ? 'This day was closed automatically because no check-out was recorded.'
                  : 'This request adds the day’s check-out.'}{' '}
                Approving records <strong>{formatDateTime(c.single.proposedCheckOut)}</strong> as
                the check-out. Enter the real time instead if you know it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="decision-check-out-date">Date</Label>
                  <DatePicker
                    id="decision-check-out-date"
                    disabled={c.busy}
                    value={c.checkOutDate}
                    onChange={c.setCheckOutDate}
                  />
                </div>
                <div>
                  <Label htmlFor="decision-check-out-time">Time</Label>
                  <TimePicker
                    id="decision-check-out-time"
                    disabled={c.busy}
                    value={c.checkOutTime}
                    onChange={c.setCheckOutTime}
                  />
                </div>
              </div>
              {(c.checkOutDate || c.checkOutTime) && !(c.checkOutDate && c.checkOutTime) && (
                <p className="text-xs">
                  Enter both a date and a time to replace the proposed check-out.
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={c.busy}
              onClick={() => c.setDeciding(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={approving ? 'default' : 'destructive'}
              disabled={
                c.busy ||
                (approving &&
                  (c.replacementInvalid || Boolean(c.checkOutDate) !== Boolean(c.checkOutTime)))
              }
              onClick={() => void c.confirm()}
            >
              {c.busy ? 'Recording...' : approving ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
