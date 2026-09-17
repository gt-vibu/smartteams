'use client';

import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';

/**
 * Asks why, before an irreversible or contested decision goes through.
 *
 * Every decision here lands in the audit trail and is shown to the person it affects, so a reason
 * is the difference between "rejected" and "rejected because the hours were logged against the
 * wrong project". The timesheet queue used to skip this and post a canned string — the record
 * looked complete while carrying no information, which is worse than no record at all.
 *
 * Destructive decisions get the destructive button. That is not decoration: approve and reject
 * sit next to each other and are one click apart.
 */
export function DecisionReasonDialog({
  busy,
  confirmLabel,
  description,
  destructive = false,
  error,
  isOpen,
  minLength = 2,
  onClose,
  onConfirm,
  title,
}: {
  busy?: boolean;
  confirmLabel: string;
  description?: string;
  destructive?: boolean;
  error?: string | null;
  isOpen: boolean;
  minLength?: number;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<unknown>;
  title: string;
}) {
  const [reason, setReason] = useState('');

  // Cleared on each open so a reason typed for one decision is never submitted against another.
  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  const ready = reason.trim().length >= minLength;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {description ?? 'The reason is recorded in the audit trail and shown to the requester.'}
        </p>

        <div className="mt-4 space-y-3">
          <Label className="block" htmlFor="decision-reason">
            Reason
          </Label>
          <Textarea
            autoFocus
            disabled={busy}
            id="decision-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          {!ready && reason.length > 0 && (
            <p className="text-[11px] text-muted-foreground">At least {minLength} characters.</p>
          )}
          {error && (
            <p className="text-[11px] font-semibold text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={busy || !ready}
              onClick={() => void onConfirm(reason.trim())}
              type="button"
              variant={destructive ? 'destructive' : 'default'}
            >
              {busy ? 'Recording…' : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
