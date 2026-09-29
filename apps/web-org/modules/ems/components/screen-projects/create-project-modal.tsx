'use client';

import React, { useState } from 'react';
import type { Branch, Employee } from '@smarteam/contracts';
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
import { EmployeeCombobox } from '../common/employee-combobox';
import { LIMITS, codeProblem, textProblem } from '@smarteam/contracts';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: readonly Branch[];
  /** Who can be chosen to lead it. */
  employees: readonly Employee[];
  /** Names already taken, so a second "beta" is questioned before it is created. */
  existingNames: readonly string[];
  saving: boolean;
  saveError: string | null;
  onCreate: (input: CreateProjectInput) => Promise<boolean>;
}

const NONE = 'none';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
  employees,
  existingNames,
  saving,
  saveError,
  onCreate,
}: CreateProjectModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(NONE);
  // Optional: a project can be created before anyone leads it, and the lead set from its page.
  const [leadId, setLeadId] = useState('');
  // Set once the administrator has been shown the name clash and chosen to go ahead anyway.
  const [nameClash, setNameClash] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setCode('');
    setName('');
    setDescription('');
    setBranchId(NONE);
    setLeadId('');
    setNameClash(false);
    setStartDate('');
    setEndDate('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('A project name is required.');
      return;
    }
    if (branchId === NONE) {
      setError('Choose the branch this project belongs to.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date cannot precede the start date.');
      return;
    }
    // Duplicate names are allowed — two "Migration" projects in different years are ordinary —
    // but they are almost always a mistake, so they are questioned once rather than refused.
    if (!nameClash && existingNames.some((existing) => same(existing, name))) {
      setNameClash(true);
      setError('');
      return;
    }
    setError('');
    const created = await onCreate({
      ...(code.trim() ? { code: code.trim() } : {}),
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      branchId,
      ...(leadId ? { projectLeadEmployeeId: leadId } : {}),
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

        <div className="sm:max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="project-code">
                Code (optional)
              </Label>
              <Input
                maxLength={LIMITS.code}
                problem={codeProblem(code, 'Project code', LIMITS.code)}
                disabled={saving}
                id="project-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder="Generated automatically"
                value={code}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block" htmlFor="project-name">
                Name
              </Label>
              <Input
                maxLength={LIMITS.title}
                problem={textProblem(name, 'Project name', LIMITS.title, 2)}
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
              maxLength={LIMITS.note}
              disabled={saving}
              id="project-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="project-lead">
              Project lead <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <EmployeeCombobox
              disabled={saving}
              employees={employees}
              id="project-lead"
              noneLabel="No lead yet"
              onChange={setLeadId}
              value={leadId}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="project-branch">
                Branch
              </Label>
              <SelectMenu disabled={saving} onValueChange={setBranchId} value={branchId}>
                <SelectTrigger id="project-branch">
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

          {nameClash && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
              role="alert"
            >
              <p className="font-semibold text-foreground">
                A project called &ldquo;{name.trim()}&rdquo; already exists.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Give this one a different name, or create it anyway and tell them apart by code.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setNameClash(false);
                    document.getElementById('project-name')?.focus();
                  }}
                  size="sm"
                  type="button"
                >
                  Rename
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => void handleSubmit()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Create anyway
                </Button>
              </div>
            </div>
          )}

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
