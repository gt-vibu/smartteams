'use client';

import React, { useMemo, useState } from 'react';
import type { Branch, Employee } from '@smarteam/contracts';
import {
  Button,
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
import { activeByName } from '../../lib/pickable';
import { EmployeeCombobox } from '../common/employee-combobox';
import { EmployeePicker } from '../common/employee-picker';
import { LIMITS, textProblem } from '@smarteam/contracts';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: readonly Employee[];
  branches: readonly Branch[];
  /** Names already taken, so a second team of one name is questioned before it is created. */
  existingNames: readonly string[];
  saving: boolean;
  saveError: string | null;
  onCreate: (
    input: { name: string; description?: string; branchId?: string; teamLeadEmployeeId?: string },
    memberEmployeeIds: string[],
  ) => Promise<boolean>;
}

const NONE = 'none';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Creates a team from the organization's real employees and branches.
 *
 * The team is created first and members are added afterwards, which is how the API models it —
 * there is no single call that does both. Status is not offered: the API creates teams ACTIVE
 * and archiving is a separate audited action with a reason.
 */
export function CreateTeamModal({
  isOpen,
  onClose,
  employees,
  branches,
  existingNames,
  saving,
  saveError,
  onCreate,
}: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(NONE);
  const [nameClash, setNameClash] = useState(false);
  const [teamLeadEmployeeId, setTeamLeadEmployeeId] = useState(NONE);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const sorted = useMemo(() => activeByName(employees), [employees]);

  const reset = () => {
    setName('');
    setDescription('');
    setBranchId(NONE);
    setNameClash(false);
    setTeamLeadEmployeeId(NONE);
    setMemberIds([]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('A team name is required.');
      return;
    }
    if (branchId === NONE) {
      setError('Choose the branch this team belongs to.');
      return;
    }
    // Questioned once rather than refused: two teams may legitimately share a name.
    if (!nameClash && existingNames.some((existing) => same(existing, name))) {
      setNameClash(true);
      setError('');
      return;
    }
    setError('');
    const created = await onCreate(
      {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        branchId,
        ...(teamLeadEmployeeId !== NONE ? { teamLeadEmployeeId } : {}),
      },
      memberIds,
    );
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
          New team
        </DialogTitle>

        <div className="sm:max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <Label className="mb-1 block" htmlFor="team-name">
              Team name
            </Label>
            <Input
              maxLength={LIMITS.title}
              problem={textProblem(name, 'Team name', LIMITS.title, 2)}
              disabled={saving}
              id="team-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Platform Core"
              value={name}
            />
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="team-description">
              Description
            </Label>
            <Textarea
              maxLength={LIMITS.note}
              disabled={saving}
              id="team-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this team is responsible for"
              rows={2}
              value={description}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="team-branch">
                Branch
              </Label>
              <SelectMenu disabled={saving} onValueChange={setBranchId} value={branchId}>
                <SelectTrigger id="team-branch">
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
              {branches.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No branches are recorded for this organization.
                </p>
              )}
            </div>

            <div>
              <Label className="mb-1 block" htmlFor="team-lead">
                Team lead
              </Label>
              <EmployeeCombobox
                disabled={saving}
                employees={employees}
                id="team-lead"
                noneLabel="No lead"
                onChange={(id) => {
                  setTeamLeadEmployeeId(id || NONE);
                  // The lead leads the team; they are not also one of its members.
                  if (id) setMemberIds((prev) => prev.filter((member) => member !== id));
                }}
                value={teamLeadEmployeeId === NONE ? '' : teamLeadEmployeeId}
              />
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground">
              Members ({memberIds.length} selected)
            </span>
            {sorted.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No employees are recorded yet, so the team will be created empty.
              </p>
            ) : (
              <EmployeePicker
                disabled={saving}
                employees={employees}
                excludeIds={teamLeadEmployeeId === NONE ? [] : [teamLeadEmployeeId]}
                onChange={setMemberIds}
                selected={memberIds}
              />
            )}
          </div>
        </div>

        {nameClash && (
          <div
            className="mx-5 mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
            role="alert"
          >
            <p className="font-semibold text-foreground">
              A team called &ldquo;{name.trim()}&rdquo; already exists.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Give this one a different name, or create it anyway.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setNameClash(false);
                  document.getElementById('team-name')?.focus();
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

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleSubmit()} type="button">
              {saving ? 'Creating...' : 'Create team'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
