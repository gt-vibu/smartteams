'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { groupPermissionCatalogue, type RoleWithPermissions } from '@smarteam/contracts';
import { Button, Checkbox, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

const GROUPS = groupPermissionCatalogue();

/**
 * Turns individual permissions on and off for an existing role.
 *
 * The picker is the same catalogue the create dialog offers — only permissions the API enforces —
 * checked as the role has them now. A permission the signed-in user does not hold is shown but
 * cannot be toggled, because the API would refuse granting or removing it; showing it disabled says
 * why the box will not move instead of letting a save fail. Nothing changes until Save; the
 * permission diff is captured in the audit history.
 */
export function AccessEditRoleDialog({
  role,
  ownPermissions,
  onClose,
  onSave,
  saving,
  saveError,
}: {
  role: RoleWithPermissions | null;
  ownPermissions: readonly string[];
  onClose: () => void;
  onSave: (roleId: string, input: { permissionKeys: string[]; reason: string }) => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
}) {
  const original = useMemo(
    () => new Set(role?.permissions.map((entry) => entry.permission.key) ?? []),
    [role],
  );
  const [selected, setSelected] = useState<Set<string>>(original);
  const isAdministrator = ownPermissions.includes('*');

  // A different role, or the same one reloaded after a save, starts from what the server holds.
  useEffect(() => {
    setSelected(new Set(original));
  }, [original]);

  const added = [...selected].filter((key) => !original.has(key));
  const removed = [...original].filter((key) => !selected.has(key));
  const changed = added.length + removed.length;
  const canToggle = (key: string) => isAdministrator || ownPermissions.includes(key);

  const save = async () => {
    if (!role || changed === 0) return;
    const ok = await onSave(role.id, {
      permissionKeys: [...selected],
      reason: 'Role permissions updated',
    });
    if (ok) onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={role !== null}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Permissions — {role?.name}
        </DialogTitle>
        <p className="border-b border-border px-5 py-3 text-[11px] text-muted-foreground">
          Changes apply to everyone with this role on their next action. You can only turn on or off
          permissions you have yourself.
        </p>

        <div className="sm:max-h-[50vh] space-y-4 overflow-y-auto p-5">
          {GROUPS.map((group) => (
            <div key={group.module}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.module}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {group.entries.map((entry) => {
                  const locked = !canToggle(entry.key);
                  return (
                    <label
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${
                        locked
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:bg-muted/40'
                      }`}
                      key={entry.key}
                      title={locked ? 'You do not have this permission yourself' : undefined}
                    >
                      <Checkbox
                        aria-label={entry.label}
                        className="shrink-0"
                        checked={selected.has(entry.key)}
                        disabled={locked || saving}
                        onCheckedChange={(checked) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(entry.key);
                            else next.delete(entry.key);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 text-sm leading-5 text-foreground">
                        {entry.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] text-muted-foreground" role="status">
            {saveError ? (
              <span className="font-semibold text-destructive">{saveError}</span>
            ) : changed === 0 ? (
              'No changes yet'
            ) : (
              `${added.length} turned on · ${removed.length} turned off`
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving || changed === 0} onClick={() => void save()} type="button">
              {saving ? 'Saving...' : 'Save permissions'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
