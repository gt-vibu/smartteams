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
  Textarea,
} from '@smarteam/ui';

interface QuickAddProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, description?: string) => Promise<unknown>;
}

export function QuickAddProjectDialog({ isOpen, onClose, onAdd }: QuickAddProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();

    if (!cleanName || cleanName.length < 2) {
      setError('Project name must be at least 2 characters.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onAdd(cleanName, description.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden bg-card border-border shadow-xl">
        <DialogHeader className="border-b border-border/80 px-5 py-3.5 bg-muted/20">
          <DialogTitle className="text-sm font-semibold text-foreground">Add Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="quick-project-name" className="text-xs font-medium text-foreground">
              Project Name <span className="text-destructive font-bold">*</span>
            </Label>
            <Input
              id="quick-project-name"
              placeholder="e.g. Website Redesign, Mobile Application"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
              className="text-xs h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-project-desc" className="text-xs font-medium text-foreground/80">
              Description (Optional)
            </Label>
            <Textarea
              id="quick-project-desc"
              placeholder="Brief summary of project scope..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-destructive pt-1" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-border/80 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs h-8 font-semibold">
              {saving ? 'Adding...' : 'Add Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
