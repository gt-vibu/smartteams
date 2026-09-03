'use client';

import React, { useMemo, useState } from 'react';
import { employeeDisplayName, type Branch, type Employee } from '@smarteam/contracts';
import {
  Button,
  Checkbox,
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

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: readonly Employee[];
  branches: readonly Branch[];
  saving: boolean;
  saveError: string | null;
  onCreate: (
    input: { name: string; description?: string; branchId?: string; teamLeadEmployeeId?: string },
    memberEmployeeIds: string[],
  ) => Promise<boolean>;
}

const NONE = 'none';

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
  saving,
  saveError,
  onCreate,
}: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(NONE);
  const [teamLeadEmployeeId, setTeamLeadEmployeeId] = useState(NONE);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b))),
    [employees],
  );

  const reset = () => {
    setName('');
    setDescription('');
    setBranchId(NONE);
    setTeamLeadEmployeeId(NONE);
    setMemberIds([]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('A team name is required.');
      return;
    }
    setError('');
    const created = await onCreate(
      {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(branchId !== NONE ? { branchId } : {}),
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <Label className="mb-1 block" htmlFor="team-name">
              Team name
            </Label>
            <Input
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
              <SelectMenu
                disabled={saving}
                onValueChange={setTeamLeadEmployeeId}
                value={teamLeadEmployeeId}
              >
                <SelectTrigger id="team-lead">
                  <SelectValue placeholder="No lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No lead</SelectItem>
                  {sorted.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeDisplayName(employee)} · {employee.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
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
              <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                {sorted.map((employee) => (
                  <label
                    className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5"
                    key={employee.id}
                  >
                    <Checkbox
                      checked={memberIds.includes(employee.id)}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        setMemberIds((prev) =>
                          checked === true
                            ? [...prev, employee.id]
                            : prev.filter((id) => id !== employee.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {employeeDisplayName(employee)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {employee.employeeNumber}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
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
            <Button disabled={saving} onClick={() => void handleSubmit()} type="button">
              {saving ? 'Creating...' : 'Create team'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
