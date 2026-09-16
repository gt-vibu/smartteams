'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { OrganizationMember, RoleWithPermissions } from '@smarteam/contracts';
import { Button, Checkbox, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

/**
 * Grants and removes roles for one member.
 *
 * The checkbox draft mirrors `AssignEmployeeModal`'s pattern: nothing is written until Save, which
 * diffs the ticked set against what the server actually reports and issues exactly the assignments
 * and revocations that changed. A role that fails to assign — because the caller cannot grant a
 * permission it carries — reports through `saveError`; the checkbox reverts on the next refetch
 * rather than staying ticked over a change that never took effect.
 */
export function AccessManageDrawer({
  isOpen,
  onClose,
  member,
  roles,
  canManage,
  saving,
  saveError,
  onAssign,
  onRevoke,
}: {
  isOpen: boolean;
  onClose: () => void;
  member: OrganizationMember | null;
  roles: RoleWithPermissions[];
  canManage: boolean;
  saving: boolean;
  saveError: string | null;
  onAssign: (userId: string, roleId: string) => Promise<boolean>;
  onRevoke: (userRoleId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !member) return;
    setDraft(new Set(member.roles.map((role) => role.id)));
  }, [isOpen, member]);

  const effectivePermissions = useMemo(() => {
    const held = new Set<string>();
    for (const roleId of draft) {
      const role = roles.find((entry) => entry.id === roleId);
      for (const grant of role?.permissions ?? []) held.add(grant.permission.key);
    }
    return held;
  }, [draft, roles]);

  const grouped = useMemo(() => {
    const byModule = new Map<string, string[]>();
    for (const role of roles) {
      for (const grant of role.permissions) {
        const key = grant.permission.key;
        const moduleName = key.split('.')[0] ?? key;
        const list = byModule.get(moduleName) ?? [];
        if (!list.includes(key)) list.push(key);
        byModule.set(moduleName, list);
      }
    }
    return [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [roles]);

  if (!member) return null;

  const handleSave = async () => {
    const current = new Set(member.roles.map((role) => role.id));
    const toAssign = [...draft].filter((id) => !current.has(id));
    const toRevoke = member.roles.filter((role) => !draft.has(role.id));
    for (const roleId of toAssign) {
      const ok = await onAssign(member.userId, roleId);
      if (!ok) return;
    }
    for (const role of toRevoke) {
      const ok = await onRevoke(role.userRoleId);
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Manage access &mdash; {member.displayName}
        </DialogTitle>
        <p className="border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
          {member.email}
        </p>

        <div className="grid max-h-[65vh] grid-cols-1 gap-0 overflow-y-auto sm:grid-cols-2">
          <div className="space-y-2 border-b border-border p-5 sm:border-b-0 sm:border-r">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Roles
            </h3>
            {roles.map((role) => (
              <label
                className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40"
                key={role.id}
              >
                <Checkbox
                  checked={draft.has(role.id)}
                  disabled={!canManage || saving}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(role.id);
                      else next.delete(role.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {role.name}
                  </span>
                  {role.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {role.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3 p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Effective permissions
            </h3>
            {effectivePermissions.size === 0 ? (
              <p className="text-[11px] text-muted-foreground">No roles selected.</p>
            ) : (
              grouped.map(([moduleName, keys]) => {
                const held = keys.filter((key) => effectivePermissions.has(key));
                if (held.length === 0) return null;
                return (
                  <div key={moduleName}>
                    <p className="text-[11px] font-bold capitalize text-foreground">{moduleName}</p>
                    <ul className="mt-1 space-y-0.5">
                      {held.map((key) => (
                        <li className="text-[11px] text-muted-foreground" key={key}>
                          <span className="mr-1 text-emerald-600 dark:text-emerald-400">
                            &#10003;
                          </span>
                          {key}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] text-muted-foreground" role="status">
            {saveError ? (
              <span className="font-semibold text-destructive">{saveError}</span>
            ) : !canManage ? (
              'You can view access here but not change it.'
            ) : (
              ' '
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            {canManage && (
              <Button disabled={saving} onClick={() => void handleSave()} type="button">
                {saving ? 'Saving...' : 'Save access'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
