'use client';

import React, { useState } from 'react';
import { groupPermissionCatalogue } from '@smarteam/contracts';
import { Button, Checkbox, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';

const GROUPS = groupPermissionCatalogue();

/**
 * Creates a role scoped to whichever real permissions the administrator picks.
 *
 * The picker offers only `PERMISSION_CATALOGUE` — every key some service in the API actually
 * enforces — so there is no way to compose a role out of a permission that does not exist. The
 * tenant wildcard is not offered here at all; `assertGrantable` would refuse it from any caller
 * who does not already hold it, and offering a checkbox for a grant the backend will reject is
 * worse than not offering it.
 */
export function AccessCreateRoleDialog({
  isOpen,
  onClose,
  saving,
  saveError,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  saving: boolean;
  saveError: string | null;
  onCreate: (input: { code: string; name: string; permissionKeys: string[] }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setName('');
    setSelected(new Set());
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.size === 0) return;
    const code = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const ok = await onCreate({ code, name: name.trim(), permissionKeys: [...selected] });
    if (ok) {
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
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Create role
        </DialogTitle>

        <div className="space-y-4 border-b border-border p-5">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              autoFocus
              id="role-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Payroll Viewer"
              value={name}
            />
          </div>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto p-5">
          {GROUPS.map((group) => (
            <div key={group.module}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.module}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {group.entries.map((entry) => (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 hover:bg-muted/40"
                    key={entry.key}
                  >
                    <Checkbox
                      checked={selected.has(entry.key)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(entry.key);
                          else next.delete(entry.key);
                          return next;
                        })
                      }
                    />
                    <span className="text-xs text-foreground">{entry.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] text-muted-foreground" role="status">
            {saveError ? (
              <span className="font-semibold text-destructive">{saveError}</span>
            ) : (
              `${selected.size} permission${selected.size === 1 ? '' : 's'} selected`
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={saving}
              onClick={() => {
                reset();
                onClose();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !name.trim() || selected.size === 0}
              onClick={() => void handleCreate()}
              type="button"
            >
              {saving ? 'Creating...' : 'Create role'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
