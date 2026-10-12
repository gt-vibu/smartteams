'use client';

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import type { OrganizationSummary } from '../../lib/api-client';

export function DeactivateCompanyDialog({
  company,
  onClose,
  onConfirm,
}: {
  company: OrganizationSummary;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (reason.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not deactivate this company. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Deactivate {company.name}?</DialogTitle>
        <p className="text-sm text-muted-foreground">
          This stops the company’s users from accessing their organization. Check the company name
          before continuing.
        </p>
        <Label htmlFor="deactivation-reason">Reason (required)</Label>
        <Textarea
          id="deactivation-reason"
          value={reason}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why access should stop (at least 3 characters)"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void confirm()}
          >
            {busy ? 'Deactivating…' : 'Deactivate company'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
