'use client';

import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import type { Branch } from '@smarteam/contracts';
import type { OrganizationState } from '../../hooks/use-organization';
import { Unavailable } from './org-profile-panel';

/**
 * Branches.
 *
 * The full lifecycle is backed: list, create, update and retire, all tenant-scoped and authorised
 * server-side. The screen this replaced kept branches in `localStorage`, so a branch created by
 * one administrator did not exist for anyone else — including for the employee assignment and
 * attendance scoping that genuinely depend on it.
 */
export function OrgBranchesPanel({ organization: state }: { organization: OrganizationState }) {
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<Branch | null>(null);

  if (state.branchesForbidden) {
    return <Unavailable detail="You do not have permission to view branches." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Branches scope employees, attendance and shift assignment.
        </p>
        {state.can.writeBranches && (
          <Button onClick={() => setCreating(true)} size="sm" type="button">
            New branch
          </Button>
        )}
      </div>

      {state.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {state.saveError}
        </p>
      )}

      {state.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading branches...
        </p>
      )}

      {!state.loading && !state.error && state.branches.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm font-bold text-foreground">No branches</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to scope employees and attendance by location.
          </p>
        </div>
      )}

      {!state.loading && !state.error && state.branches.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Branch</th>
                <th className="px-4 py-2.5 font-bold">Code</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.branches.map((branch) => (
                <tr
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  key={branch.id}
                >
                  <td className="px-4 py-2.5 font-semibold text-foreground">{branch.name}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{branch.code}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={branch.status === 'DEACTIVATED' ? 'secondary' : 'success'}>
                      {branch.status === 'DEACTIVATED' ? 'Retired' : 'Active'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {state.can.writeBranches && branch.status !== 'DEACTIVATED' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => setEditing(branch)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => setRetiring(branch)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Retire
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        The API does not report how many employees a branch holds, so no headcount is shown.
      </p>

      <BranchDialog
        branch={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
        state={state}
      />
      <RetireBranchDialog
        branch={retiring}
        onOpenChange={(open) => !open && setRetiring(null)}
        open={retiring !== null}
        state={state}
      />
    </div>
  );
}

function BranchDialog({
  state,
  branch,
  open,
  onOpenChange,
}: {
  state: OrganizationState;
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
  }, [branch, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2 || !code.trim()) return;
    const input = { name: name.trim(), code: code.trim() };
    const ok = branch
      ? await state.updateBranch(branch.id, input)
      : await state.createBranch(input);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{branch ? 'Edit branch' : 'New branch'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="branch-name">
              Name
            </Label>
            <Input
              disabled={state.saving}
              id="branch-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="branch-code">
              Code
            </Label>
            <Input
              disabled={state.saving}
              id="branch-code"
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </div>
          {state.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {state.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={state.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={state.saving} type="submit">
              {state.saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetireBranchDialog({
  state,
  branch,
  open,
  onOpenChange,
}: {
  state: OrganizationState;
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branch || reason.trim().length < 2) return;
    const ok = await state.retireBranch(branch.id, reason.trim());
    if (ok) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Retire {branch?.name ?? 'branch'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Label className="block" htmlFor="branch-retire-reason">
            Reason
          </Label>
          <Textarea
            disabled={state.saving}
            id="branch-retire-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          {state.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {state.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={state.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={state.saving || reason.trim().length < 2} type="submit">
              {state.saving ? 'Retiring...' : 'Retire'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
