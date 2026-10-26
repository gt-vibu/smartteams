'use client';

import React from 'react';
import { Button, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

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
 * Archiving is not a delete — the record stays and stops appearing in the active list. The action
 * is recorded automatically in the audit trail.
 */
export function ArchiveDialog({
  isOpen,
  onClose,
  subject,
  saving,
  saveError,
  onArchive,
}: ArchiveDialogProps) {
  const handleSubmit = async () => {
    const archived = await onArchive(`Archived ${subject} from active records`);
    if (archived) {
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
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
            kept, and this action is recorded in the audit history.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {saveError}
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
