'use client';

import React, { useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { CompensationState } from '../../hooks/use-compensation';
import {
  componentCode,
  EMPTY_COMPONENT,
  NewComponentFields,
  type NewComponentDraft,
} from './new-component-fields';
import { LIMITS } from '@smarteam/contracts';

const NEW = '__new__';
const today = () => new Date().toLocaleDateString('en-CA');

/**
 * Assigns a catalogue component to the selected employee for a period.
 *
 * Which value field applies follows the component's own calculation basis, so a fixed component
 * asks for an amount and a percentage component for a percentage — the backend rejects the wrong
 * pairing, and rejects an assignment that overlaps an existing one. Neither rule is duplicated
 * here; the server's message is shown when it refuses.
 *
 * A new organization has an empty catalogue, which left this dialog with nothing to choose and no
 * way forward. "New component" creates one here and assigns it in the same step.
 */
export function AssignComponentDialog({
  compensation,
  open,
  onOpenChange,
}: {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [payComponentId, setPayComponentId] = useState('');
  const [value, setValue] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [draft, setDraft] = useState<NewComponentDraft>(EMPTY_COMPONENT);
  const canCreate = compensation.can.createComponent;
  const creating = payComponentId === NEW || (canCreate && compensation.components.length === 0);
  const [effectiveTo, setEffectiveTo] = useState('');

  const selected = compensation.components.find((entry) => entry.id === payComponentId) ?? null;
  const isPercentage = creating
    ? draft.calculationType === 'PERCENTAGE_OF_BASE'
    : selected?.calculationType === 'PERCENTAGE_OF_BASE';
  const ready = creating ? componentCode(draft.name).length > 0 : Boolean(selected);

  const reset = () => {
    setPayComponentId('');
    setValue('');
    setEffectiveFrom(today());
    setEffectiveTo('');
    setDraft(EMPTY_COMPONENT);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numeric = Number(value);
    if (!ready || !effectiveFrom || value === '' || !Number.isFinite(numeric) || numeric < 0)
      return;
    const assignment = {
      ...(isPercentage ? { percentage: numeric } : { amount: numeric }),
      effectiveFrom,
      ...(effectiveTo ? { effectiveTo } : {}),
    };
    const ok = creating
      ? await compensation.createAndAssignComponent(
          { ...draft, name: draft.name.trim(), code: componentCode(draft.name) },
          assignment,
        )
      : await compensation.assignComponent({ payComponentId, ...assignment });
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Assign a pay component</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block">Component</Label>
            <SelectMenu onValueChange={setPayComponentId} value={payComponentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a component" />
              </SelectTrigger>
              <SelectContent>
                {compensation.components.map((component) => (
                  <SelectItem key={component.id} value={component.id}>
                    {component.name}
                  </SelectItem>
                ))}
                {canCreate && <SelectItem value={NEW}>+ New component</SelectItem>}
              </SelectContent>
            </SelectMenu>
            {!canCreate && compensation.components.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No components exist yet. Ask someone who manages the pay catalogue to add one.
              </p>
            )}
          </div>

          {creating && (
            <NewComponentFields disabled={compensation.saving} draft={draft} onChange={setDraft} />
          )}

          <div>
            <Label className="mb-1 block" htmlFor="assignment-value">
              {isPercentage ? 'Percentage of Basic (%)' : 'Monthly amount (₹)'}
            </Label>
            <Input
              min={0}
              max={isPercentage ? 100 : LIMITS.amount}
              disabled={compensation.saving || !ready}
              id="assignment-value"
              inputMode="decimal"
              onChange={(event) => setValue(event.target.value)}
              type="number"
              value={value}
            />
            {ready && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {isPercentage
                  ? 'Payroll applies this percentage to the base it derives for the period.'
                  : 'Payroll uses this amount as-is, prorated with the rest of the structure.'}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="assignment-from">
                Effective from
              </Label>
              <DatePicker
                disabled={compensation.saving}
                id="assignment-from"
                max={effectiveTo || undefined}
                onChange={setEffectiveFrom}
                value={effectiveFrom}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="assignment-to">
                Effective to
              </Label>
              <DatePicker
                disabled={compensation.saving}
                id="assignment-to"
                min={effectiveFrom || undefined}
                onChange={setEffectiveTo}
                placeholder="Open ended"
                value={effectiveTo}
              />
            </div>
          </div>

          {compensation.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {compensation.saveError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              disabled={compensation.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={compensation.saving || !ready || !effectiveFrom || value === ''}
              type="submit"
            >
              {compensation.saving ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
