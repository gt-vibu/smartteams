'use client';

import React, { useState } from 'react';
import type { RoleWithPermissions } from '@smarteam/contracts';
import { Button, Checkbox, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';

/**
 * Onboards a new member with one or more roles in a single call.
 *
 * A known email is attached to their existing account rather than duplicated — the API refuses a
 * second identity for the same address — so the temporary password shown afterward is present
 * only when a genuinely new login was created.
 */
export function AccessAddMemberDialog({
  isOpen,
  onClose,
  roles,
  saving,
  saveError,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleWithPermissions[];
  saving: boolean;
  saveError: string | null;
  onAdd: (input: {
    email: string;
    displayName: string;
    roleIds: string[];
    reason: string;
  }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setEmail('');
    setDisplayName('');
    setReason('');
    setSelected(new Set());
  };

  const canSubmit =
    email.trim().length > 3 &&
    displayName.trim().length >= 2 &&
    reason.trim().length >= 3 &&
    selected.size > 0;

  const handleAdd = async () => {
    if (!canSubmit) return;
    const ok = await onAdd({
      email: email.trim(),
      displayName: displayName.trim(),
      roleIds: [...selected],
      reason: reason.trim(),
    });
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
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Add a member
        </DialogTitle>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Roles</Label>
            <div className="space-y-0.5 rounded-md border border-border p-2">
              {roles.map((role) => (
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 hover:bg-muted/40"
                  key={role.id}
                >
                  <Checkbox
                    checked={selected.has(role.id)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(role.id);
                        else next.delete(role.id);
                        return next;
                      })
                    }
                  />
                  <span className="text-xs text-foreground">{role.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-reason">Reason</Label>
            <Input
              id="member-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this person being added?"
              value={reason}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold text-destructive" role="status">
            {saveError}
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
            <Button disabled={saving || !canSubmit} onClick={() => void handleAdd()} type="button">
              {saving ? 'Adding...' : 'Add member'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
