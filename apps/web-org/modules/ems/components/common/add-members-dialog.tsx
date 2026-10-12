'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label } from '@smarteam/ui';
import type { employeeDisplayName } from '@smarteam/contracts';
import type { PicklistKind } from '../../hooks/use-picklist';
import { EmployeePicker } from './employee-picker';
import { PicklistSelect } from './picklist-select';

type Person = Parameters<typeof employeeDisplayName>[0] & {
  id: string;
  employeeNumber?: string | null;
  status?: string | null;
};

/**
 * Adding people to a project or a team: the shared employee picker (several at once), one role
 * for all of them from the organization's list, then Add. Each person is added through the API in
 * turn; anyone refused (already a member, left the company) is reported by name, and the others
 * are still added.
 */
export function AddMembersDialog<T extends Person>({
  open,
  onClose,
  title,
  employees,
  excludeIds,
  roleKind,
  roleLabel,
  onAdd,
  nameOf,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  employees: readonly T[];
  /** Current members, who are not offered again. */
  excludeIds: readonly string[];
  roleKind?: PicklistKind;
  roleLabel?: string;
  /** Adds one person; resolves to true when the API accepted it. */
  onAdd: (employeeId: string, role: string) => Promise<boolean>;
  nameOf: (employeeId: string) => string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);

  const reset = () => {
    setSelected([]);
    setRole('');
    setFailed([]);
    setError('');
    setAdded(0);
  };

  const submit = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    const refused: string[] = [];
    try {
      for (const employeeId of selected) {
        try {
          if (!(await onAdd(employeeId, role))) refused.push(employeeId);
          else setAdded((value) => value + 1);
        } catch (caught) {
          refused.push(employeeId);
          setError(caught instanceof Error ? caught.message : 'The member could not be added.');
        }
      }
    } finally {
      setBusy(false);
    }
    setBusy(false);
    if (refused.length === 0) {
      reset();
      onClose();
    } else {
      setSelected(refused);
      setFailed(refused);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <div className="mt-3 space-y-4">
          <EmployeePicker
            disabled={busy}
            employees={employees}
            excludeIds={excludeIds}
            onChange={setSelected}
            selected={selected}
          />
          {roleKind && roleLabel && (
            <div>
              <Label className="mb-1 block">{roleLabel}</Label>
              <PicklistSelect
                addLabel="+ Add a role"
                disabled={busy}
                kind={roleKind}
                noneLabel="No role"
                onChange={setRole}
                value={role}
              />
            </div>
          )}
          {failed.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              {added} added. {failed.length} could not be added:{' '}
              {failed.map((id) => (nameOf(id) === 'Someone' ? id : nameOf(id))).join(', ')}.{' '}
              {error ||
                'Review their current membership and employment status, then retry. Successful additions are excluded.'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={busy || selected.length === 0}
              onClick={() => void submit()}
              type="button"
            >
              {busy
                ? 'Adding…'
                : `Add ${selected.length || ''} ${selected.length === 1 ? 'person' : 'people'}`.replace(
                    '  ',
                    ' ',
                  )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
