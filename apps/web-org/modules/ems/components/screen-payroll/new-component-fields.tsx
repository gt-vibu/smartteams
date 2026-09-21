'use client';

import React from 'react';
import { Input, Label } from '@smarteam/ui';

export type NewComponentDraft = {
  name: string;
  componentType: 'EARNING' | 'DEDUCTION';
  calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
  isTaxable: boolean;
};

export const EMPTY_COMPONENT: NewComponentDraft = {
  name: '',
  componentType: 'EARNING',
  calculationType: 'FIXED',
  isTaxable: true,
};

/** Common Indian salary heads, offered as one-tap names. Anything else can be typed. */
const SUGGESTIONS = [
  'Special Allowance',
  'Conveyance Allowance',
  'Medical Allowance',
  'Leave Travel Allowance',
  'Performance Bonus',
  'Food Coupons',
];

/** A catalogue code from a name: "Special Allowance" becomes "SPECIAL_ALLOWANCE". */
export function componentCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function Choice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * The few things a new pay component needs, asked in plain words. The catalogue code is derived
 * from the name, so nobody has to invent one.
 */
export function NewComponentFields({
  draft,
  onChange,
  disabled,
}: {
  draft: NewComponentDraft;
  onChange: (draft: NewComponentDraft) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof NewComponentDraft>(key: K, value: NewComponentDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <Label className="mb-1 block" htmlFor="new-component-name">
          Component name
        </Label>
        <Input
          disabled={disabled}
          id="new-component-name"
          maxLength={80}
          onChange={(event) => set('name', event.target.value)}
          placeholder="e.g. Special Allowance"
          value={draft.name}
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {SUGGESTIONS.map((name) => (
            <button
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              disabled={disabled}
              key={name}
              onClick={() => set('name', name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-1 block">Type</Label>
        <div className="flex gap-2">
          <Choice
            active={draft.componentType === 'EARNING'}
            onClick={() => set('componentType', 'EARNING')}
          >
            Earning
          </Choice>
          <Choice
            active={draft.componentType === 'DEDUCTION'}
            onClick={() => set('componentType', 'DEDUCTION')}
          >
            Deduction
          </Choice>
        </div>
      </div>
      <div>
        <Label className="mb-1 block">Calculated as</Label>
        <div className="flex gap-2">
          <Choice
            active={draft.calculationType === 'FIXED'}
            onClick={() => set('calculationType', 'FIXED')}
          >
            Fixed amount
          </Choice>
          <Choice
            active={draft.calculationType === 'PERCENTAGE_OF_BASE'}
            onClick={() => set('calculationType', 'PERCENTAGE_OF_BASE')}
          >
            % of Basic
          </Choice>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          checked={draft.isTaxable}
          disabled={disabled}
          onChange={(event) => set('isTaxable', event.target.checked)}
          type="checkbox"
        />
        Taxable
      </label>
    </div>
  );
}
