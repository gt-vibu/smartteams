'use client';

import React, { useEffect, useState } from 'react';
import type { Branch, Project } from '@smarteam/contracts';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smarteam/ui';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Edits a project after it exists: its name, what it is, which branch it belongs to and when it
 * runs. Until this, a project created with the wrong name or branch stayed that way — the API
 * accepted the change, no screen offered it.
 *
 * The code is not editable. It is what payroll, timesheets and every past report refer to.
 */
export function EditProjectDialog({
  project,
  branches,
  otherNames,
  open,
  saving,
  saveError,
  onClose,
  onSave,
}: {
  project: Project;
  branches: readonly Branch[];
  /** Every other project's name, so a rename onto a taken one is questioned. */
  otherNames: readonly string[];
  open: boolean;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    description?: string;
    branchId: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [nameClash, setNameClash] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setBranchId(project.branchId ?? '');
    setStartDate(project.startDate?.slice(0, 10) ?? '');
    setEndDate(project.endDate?.slice(0, 10) ?? '');
    setError('');
    setNameClash(false);
  }, [open, project]);

  const submit = async () => {
    if (!name.trim()) {
      setError('A project name is required.');
      return;
    }
    if (!branchId) {
      setError('Choose the branch this project belongs to.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date cannot precede the start date.');
      return;
    }
    if (!nameClash && otherNames.some((other) => same(other, name))) {
      setNameClash(true);
      setError('');
      return;
    }
    setError('');
    const saved = await onSave({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      branchId,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    if (saved) onClose();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Edit project &mdash; {project.code ?? project.name}
        </DialogTitle>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <Label className="mb-1 block" htmlFor="edit-project-name">
              Name
            </Label>
            <Input
              disabled={saving}
              id="edit-project-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="edit-project-description">
              Description
            </Label>
            <Textarea
              disabled={saving}
              id="edit-project-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="edit-project-branch">
                Branch
              </Label>
              <SelectMenu disabled={saving} onValueChange={setBranchId} value={branchId}>
                <SelectTrigger id="edit-project-branch">
                  <SelectValue placeholder="Choose a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="edit-project-start">
                Start date
              </Label>
              <DatePicker
                disabled={saving}
                id="edit-project-start"
                max={endDate || undefined}
                onChange={setStartDate}
                value={startDate}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="edit-project-end">
                End date
              </Label>
              <DatePicker
                disabled={saving}
                id="edit-project-end"
                min={startDate || undefined}
                onChange={setEndDate}
                value={endDate}
              />
            </div>
          </div>

          {nameClash && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
              role="alert"
            >
              <p className="font-semibold text-foreground">
                Another project is already called &ldquo;{name.trim()}&rdquo;.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setNameClash(false);
                    document.getElementById('edit-project-name')?.focus();
                  }}
                  size="sm"
                  type="button"
                >
                  Rename
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => void submit()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Save anyway
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void submit()} type="button">
              {saving ? 'Saving...' : 'Save project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
