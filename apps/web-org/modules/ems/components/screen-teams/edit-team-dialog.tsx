'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { employeeDisplayName, type Branch, type Employee, type Team } from '@smarteam/contracts';
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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Edits a team after it exists: its name, what it does, which branch it belongs to and who leads
 * it. Members are managed from the drawer itself, which is where they are already listed.
 */
export function EditTeamDialog({
  team,
  branches,
  employees,
  otherNames,
  open,
  saving,
  saveError,
  onClose,
  onSave,
}: {
  team: Team;
  branches: readonly Branch[];
  employees: readonly Employee[];
  /** Every other team's name, so a rename onto a taken one is questioned. */
  otherNames: readonly string[];
  open: boolean;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    description?: string;
    branchId: string;
    teamLeadEmployeeId?: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [error, setError] = useState('');
  const [nameClash, setNameClash] = useState(false);
  const sorted = useMemo(() => activeByName(employees), [employees]);

  useEffect(() => {
    if (!open) return;
    setName(team.name);
    setDescription(team.description ?? '');
    setBranchId(team.branchId ?? '');
    setLeadId(team.teamLeadEmployeeId ?? '');
    setError('');
    setNameClash(false);
  }, [open, team]);

  const submit = async () => {
    if (!name.trim()) {
      setError('A team name is required.');
      return;
    }
    if (!branchId) {
      setError('Choose the branch this team belongs to.');
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
      ...(leadId ? { teamLeadEmployeeId: leadId } : {}),
    });
    if (saved) onClose();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Edit team &mdash; {team.name}
        </DialogTitle>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <Label className="mb-1 block" htmlFor="edit-team-name">
              Name
            </Label>
            <Input
              disabled={saving}
              id="edit-team-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="edit-team-description">
              Description
            </Label>
            <Textarea
              disabled={saving}
              id="edit-team-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="edit-team-branch">
                Branch
              </Label>
              <SelectMenu disabled={saving} onValueChange={setBranchId} value={branchId}>
                <SelectTrigger id="edit-team-branch">
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
              <Label className="mb-1 block" htmlFor="edit-team-lead">
                Team lead
              </Label>
              <SelectMenu disabled={saving} onValueChange={setLeadId} value={leadId}>
                <SelectTrigger id="edit-team-lead">
                  <SelectValue placeholder="No lead" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeDisplayName(employee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
          </div>

          {nameClash && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
              role="alert"
            >
              <p className="font-semibold text-foreground">
                Another team is already called &ldquo;{name.trim()}&rdquo;.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setNameClash(false);
                    document.getElementById('edit-team-name')?.focus();
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
              {saving ? 'Saving...' : 'Save team'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
