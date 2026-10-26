'use client';

import { Button, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

/** Confirms an approval decision without asking the reviewer to write a comment. */
export function DecisionConfirmDialog({
  busy,
  confirmLabel,
  description,
  destructive = false,
  error,
  isOpen,
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
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  title: string;
}) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        {error && (
          <p className="mt-3 text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => void onConfirm()}
            type="button"
            variant={destructive ? 'destructive' : 'default'}
          >
            {busy ? 'Recording…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
