'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label, Select } from '@smarteam/ui';

/**
 * "Add myself as employee" — an administrator giving themselves an employee identity.
 *
 * One person, one login. This creates an employee record and links it to the account already
 * signed in, so the administrator ends up with a user, an organization membership, their admin
 * roles *and* an employee record — not a second account. The user id is taken from the session
 * inside the hook and never appears on this form, so it cannot be pointed at anybody else.
 *
 * Their roles and permissions are untouched by this; the only thing that changes is that the
 * Employee Workspace now has an employee to resolve, which is what makes it available.
 */
export function AccessSelfEnrollDialog({
  isOpen,
  onClose,
  displayName,
  saving,
  saveError,
  onEnroll,
}: {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  saving: boolean;
  saveError: string | null;
  onEnroll: (input: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    employmentType: string;
    workEmail?: string;
    dateOfJoining?: string;
  }) => Promise<boolean>;
}) {
  const [first = '', ...rest] = displayName.trim().split(/\s+/);
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(rest.join(' '));
  const [employmentType, setEmploymentType] = useState('FULL_TIME');

  const canSubmit =
    employeeNumber.trim().length > 0 && firstName.trim().length > 0 && lastName.trim().length > 0;

  const handleEnroll = async () => {
    if (!canSubmit) return;
    const ok = await onEnroll({
      employeeNumber: employeeNumber.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      employmentType,
    });
    if (ok) onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Add myself as employee
        </DialogTitle>

        <div className="space-y-4 p-5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            This creates an employee record and links it to your existing account. You keep the same
            login, the same organization and the same administrative roles — you simply gain an
            Employee Workspace alongside the admin one.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="self-number">Employee number</Label>
            <Input
              autoFocus
              id="self-number"
              onChange={(event) => setEmployeeNumber(event.target.value)}
              placeholder="e.g. EMP-001"
              value={employeeNumber}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="self-first">First name</Label>
              <Input
                id="self-first"
                onChange={(event) => setFirstName(event.target.value)}
                value={firstName}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="self-last">Last name</Label>
              <Input
                id="self-last"
                onChange={(event) => setLastName(event.target.value)}
                value={lastName}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="self-type">Employment type</Label>
            <Select
              id="self-type"
              onChange={(event) => setEmploymentType(event.target.value)}
              value={employmentType}
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="status">
            {saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving || !canSubmit}
              onClick={() => void handleEnroll()}
              type="button"
            >
              {saving ? 'Adding...' : 'Add myself'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
