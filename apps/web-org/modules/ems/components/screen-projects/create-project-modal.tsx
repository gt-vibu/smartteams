'use client';

import React, { useState } from 'react';
import type { Branch } from '@smarteam/contracts';
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
import type { CreateProjectInput } from '../../repositories/teams-projects.repository';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: readonly Branch[];
  saving: boolean;
  saveError: string | null;
  onCreate: (input: CreateProjectInput) => Promise<boolean>;
}

const NONE = 'none';

/**
 * Creates a project.
 *
 * Members are allocated afterwards from the project drawer rather than here: allocation needs a
 * role and a percentage per person, and the API adds members one call at a time, so doing it in
 * the create form would hide a partial failure behind a single "create" button.
 */
export function CreateProjectModal({
  isOpen,
  onClose,
  branches,
  saving,
  saveError,
  onCreate,
}: CreateProjectModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(NONE);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setCode('');
    setName('');
    setDescription('');
    setBranchId(NONE);
    setStartDate('');
    setEndDate('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!code.trim() || !name.trim()) {
      setError('A project code and name are both required.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date cannot precede the start date.');
      return;
    }
    setError('');
    const created = await onCreate({
      code: code.trim(),
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(branchId !== NONE ? { branchId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    if (created) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          New project
        </DialogTitle>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="project-code">
                Code
              </Label>
              <Input
                disabled={saving}
                id="project-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder="LUX-2026"
                value={code}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block" htmlFor="project-name">
                Name
              </Label>
              <Input
                disabled={saving}
                id="project-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                value={name}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="project-description">
              Description
            </Label>
            <Textarea
              disabled={saving}
              id="project-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="project-branch">
                Branch
              </Label>
              <SelectMenu disabled={saving} onValueChange={setBranchId} value={branchId}>
                <SelectTrigger id="project-branch">
                  <SelectValue placeholder="No branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No branch</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="project-start">
                Start date
              </Label>
              <DatePicker
                disabled={saving}
                id="project-start"
                max={endDate || undefined}
                onChange={setStartDate}
                value={startDate}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="project-end">
                End date
              </Label>
              <DatePicker
                disabled={saving}
                id="project-end"
                min={startDate || undefined}
                onChange={setEndDate}
                value={endDate}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Allocate people from the project once it exists.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleSubmit()} type="button">
              {saving ? 'Creating...' : 'Create project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
