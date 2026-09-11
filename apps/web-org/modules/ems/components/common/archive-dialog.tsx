'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';

interface ArchiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** What is being archived, e.g. "team Platform Core". */
  subject: string;
  saving: boolean;
  saveError: string | null;
  onArchive: (reason: string) => Promise<boolean>;
}

/**
 * Archives a team or project.
 *
 * The API has supported this from the start and requires a reason, which it writes to the audit
 * trail; no screen offered it before, so archiving was only reachable by calling the API
 * directly. Archiving is not a delete — the record stays and stops appearing in the active list.
 */
export function ArchiveDialog({
  isOpen,
  onClose,
  subject,
  saving,
  saveError,
  onArchive,
}: ArchiveDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (reason.trim().length < 2) {
      setError('A reason is required, and is recorded in the audit trail.');
      return;
    }
    setError('');
    const archived = await onArchive(reason.trim());
    if (archived) {
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setReason('');
          setError('');
          onClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Archive {subject}
        </DialogTitle>

        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">
            Archiving removes this from the active list. The record and its membership history are
            kept, and the reason below is written to the audit trail.
          </p>
          <div>
            <Label className="mb-1 block" htmlFor="archive-reason">
              Reason
            </Label>
            <Textarea
              disabled={saving}
              id="archive-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this being archived?"
              rows={3}
              value={reason}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => void handleSubmit()}
              type="button"
              variant="destructive"
            >
              {saving ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
