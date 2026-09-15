'use client';

import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@smarteam/ui';

interface QuickAddJobDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => Promise<unknown>;
}

export function QuickAddJobDialog({ isOpen, onClose, onAdd }: QuickAddJobDialogProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || clean.length < 2) {
      setError('Please enter a job/work type name (minimum 2 characters).');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await onAdd(clean);
      if (res !== false) {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add job type.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold">Add Job Type</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="quick-job-name" className="text-xs font-medium">
              Job Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quick-job-name"
              placeholder="e.g. API Development, System Architecture"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Once added, this job type persists in the backend and will be available in future
              dropdowns.
            </p>
          </div>

          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Adding...' : 'Add Job Type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
