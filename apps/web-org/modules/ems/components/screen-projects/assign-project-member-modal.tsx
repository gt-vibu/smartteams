'use client';

import React, { useMemo, useState } from 'react';
import { employeeDisplayName, type Employee } from '@smarteam/contracts';
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
} from '@smarteam/ui';
import type { AddProjectMemberInput } from '../../hooks/use-project-directory';

interface AssignProjectMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  /** Employees not already allocated to this project. */
  candidates: readonly Employee[];
  saving: boolean;
  saveError: string | null;
  onAssign: (member: AddProjectMemberInput) => Promise<boolean>;
}

/**
 * Allocates one employee to a project.
 *
 * Allocation is captured here because it is fixed at assignment time — the API exposes no route
 * to change a membership row afterwards.
 */
export function AssignProjectMemberModal({
  isOpen,
  onClose,
  projectName,
  candidates,
  saving,
  saveError,
  onAssign,
}: AssignProjectMemberModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [projectRole, setProjectRole] = useState('');
  const [allocation, setAllocation] = useState(50);
  const [error, setError] = useState('');

  const sorted = useMemo(
    () =>
      [...candidates].sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b))),
    [candidates],
  );

  const reset = () => {
    setEmployeeId('');
    setProjectRole('');
    setAllocation(50);
    setError('');
  };

  const handleSubmit = async () => {
    if (!employeeId) {
      setError('Select an employee to allocate.');
      return;
    }
    setError('');
    const assigned = await onAssign({
      employeeId,
      ...(projectRole.trim() ? { projectRole: projectRole.trim() } : {}),
      allocationPercentage: allocation,
    });
    if (assigned) {
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
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Allocate to {projectName}
        </DialogTitle>

        <div className="space-y-4 p-5">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Every employee in the directory is already allocated to this project.
            </p>
          ) : (
            <>
              <div>
                <Label className="mb-1 block" htmlFor="allocate-employee">
                  Employee
                </Label>
                <SelectMenu disabled={saving} onValueChange={setEmployeeId} value={employeeId}>
                  <SelectTrigger id="allocate-employee">
                    <SelectValue placeholder="Select an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {sorted.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employeeDisplayName(employee)} · {employee.employeeNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </div>

              <div>
                <Label className="mb-1 block" htmlFor="allocate-role">
                  Project role
                </Label>
                <Input
                  disabled={saving}
                  id="allocate-role"
                  onChange={(event) => setProjectRole(event.target.value)}
                  placeholder="e.g. Frontend Lead"
                  value={projectRole}
                />
              </div>

              <div>
                <Label className="mb-1 block" htmlFor="allocate-percentage">
                  Allocation ({allocation}%)
                </Label>
                <input
                  className="w-full cursor-pointer accent-primary"
                  disabled={saving}
                  id="allocate-percentage"
                  max="100"
                  min="10"
                  onChange={(event) => setAllocation(Number.parseInt(event.target.value, 10))}
                  step="5"
                  type="range"
                  value={allocation}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Allocation is fixed at assignment; it cannot be edited afterwards.
                </p>
              </div>
            </>
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
            <Button
              disabled={saving || sorted.length === 0}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {saving ? 'Allocating...' : 'Allocate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
