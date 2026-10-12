'use client';

import React, { useState } from 'react';
import {
  Button,
  Input,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { usePicklist, type PicklistKind } from '../../hooks/use-picklist';

const NONE = '__none__';
const NEW = '__new__';

/**
 * A dropdown of one of the organization's lists, A to Z, with "+ Add new" at the end.
 *
 * A name typed into Add is the form's value from the first keystroke, so the form's own Save or
 * Allocate uses it straight away; the server adds it to the list as part of that save. Add saves
 * it to the list on its own as well. Archived names are not offered, but a record that already
 * carries one still shows it.
 */
export function PicklistSelect({
  kind,
  value,
  onChange,
  noneLabel = 'Not set',
  addLabel = '+ Add new',
  extra = [],
  disabled = false,
  showAddOption = true,
}: {
  kind: PicklistKind;
  value: string;
  onChange: (value: string) => void;
  noneLabel?: string;
  addLabel?: string;
  /** Names in use on records that are not in the list, so they still show. */
  extra?: string[];
  disabled?: boolean;
  showAddOption?: boolean;
}) {
  const list = usePicklist(kind);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const known = (name: string) =>
    list.entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase());
  const names = [
    ...list.active.map((entry) => entry.name),
    ...extra.filter((name) => name && !known(name)),
  ];
  if (value && !names.includes(value)) names.push(value);
  names.sort((a, b) => a.localeCompare(b));

  const type = (text: string) => {
    setDraft(text);
    onChange(text.trim().replace(/\s+/g, ' '));
  };
  const close = (keep: boolean) => {
    setAdding(false);
    setDraft('');
    if (!keep) onChange('');
  };
  const save = async () => {
    if (draft.trim().length < 2 || list.saving) return;
    const saved = await list.add(draft);
    if (saved) {
      onChange(saved);
      close(true);
    }
  };

  if (adding)
    return (
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            autoFocus
            disabled={disabled}
            maxLength={80}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                close(false);
              }
            }}
            placeholder="New name"
            value={draft}
          />
          <Button
            disabled={disabled || list.saving || draft.trim().length < 2}
            onClick={() => void save()}
            size="sm"
            type="button"
          >
            {list.saving ? 'Adding…' : 'Add'}
          </Button>
          <Button onClick={() => close(false)} size="sm" type="button" variant="outline">
            Cancel
          </Button>
        </div>
        {list.error && (
          <p className="text-[11px] text-destructive" role="alert">
            {list.error}
          </p>
        )}
      </div>
    );

  return (
    <SelectMenu
      disabled={disabled}
      onValueChange={(next) => {
        if (next === NEW) setAdding(true);
        else onChange(next === NONE ? '' : next);
      }}
      value={value || NONE}
    >
      <SelectTrigger>
        <SelectValue placeholder={noneLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        {list.canAdd && showAddOption && <SelectItem value={NEW}>{addLabel}</SelectItem>}
      </SelectContent>
    </SelectMenu>
  );
}
