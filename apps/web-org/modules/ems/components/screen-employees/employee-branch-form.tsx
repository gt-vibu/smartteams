'use client';

import type { Branch } from '@smarteam/contracts';
import {
  Button,
  DatePicker,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { useState } from 'react';

export type BranchChange = 'add' | 'transfer';

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/**
 * The form for either change, worded for what it does: an additional branch runs from a date and
 * optionally until one; a transfer moves the primary from a date and the old one ends the day
 * before.
 */
export function BranchChangeForm({
  kind,
  branches,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  kind: BranchChange;
  branches: readonly Branch[];
  busy: boolean;
  error: string | null;
  onSubmit: (input: { branchId: string; from: string; until: string }) => void;
  onCancel: () => void;
}) {
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(today());
  const [until, setUntil] = useState('');
  const invalid = !branchId || !from || (until !== '' && until < from) || branches.length === 0;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="font-semibold text-foreground">
        {kind === 'transfer' ? 'Transfer primary branch' : 'Add a branch'}
      </p>
      <div>
        <Label className="mb-1 block" htmlFor="branch-change-branch">
          {kind === 'transfer' ? 'New primary branch' : 'Branch'}
        </Label>
        <SelectMenu disabled={busy} onValueChange={setBranchId} value={branchId}>
          <SelectTrigger id="branch-change-branch">
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
        {branches.length === 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            There is no other active branch to choose.
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block" htmlFor="branch-change-from">
            {kind === 'transfer' ? 'Effective from' : 'From'}
          </Label>
          <DatePicker disabled={busy} id="branch-change-from" onChange={setFrom} value={from} />
        </div>
        {kind === 'add' && (
          <div>
            <Label className="mb-1 block" htmlFor="branch-change-until">
              Until (optional)
            </Label>
            <DatePicker
              disabled={busy}
              id="branch-change-until"
              min={from || undefined}
              onChange={setUntil}
              value={until}
            />
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {kind === 'transfer'
          ? 'The current primary ends the day before and stays in the history.'
          : 'They keep their primary branch; this one is added alongside it.'}
      </p>
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={onCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={busy || invalid}
          onClick={() => onSubmit({ branchId, from, until })}
          size="sm"
          type="button"
        >
          {busy ? 'Saving…' : kind === 'transfer' ? 'Transfer' : 'Add branch'}
        </Button>
      </div>
    </div>
  );
}
