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

/**
 * Assigns a catalogue component to the selected employee for a period.
 *
 * Which value field applies follows the component's own calculation basis, so a fixed component
 * asks for an amount and a percentage component for a percentage — the backend rejects the wrong
 * pairing, and rejects an assignment that overlaps an existing one. Neither rule is duplicated
 * here; the server's message is shown when it refuses.
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
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  const selected = compensation.components.find((entry) => entry.id === payComponentId) ?? null;
  const isPercentage = selected?.calculationType === 'PERCENTAGE_OF_BASE';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numeric = Number(value);
    if (!payComponentId || !effectiveFrom || !Number.isFinite(numeric) || numeric < 0) return;
    const ok = await compensation.assignComponent({
      payComponentId,
      ...(isPercentage ? { percentage: numeric } : { amount: numeric }),
      effectiveFrom,
      ...(effectiveTo ? { effectiveTo } : {}),
    });
    if (ok) {
      setPayComponentId('');
      setValue('');
      setEffectiveFrom('');
      setEffectiveTo('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
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
                    {component.code} — {component.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="assignment-value">
              {isPercentage ? 'Percentage of base' : 'Amount'}
            </Label>
            <Input
              disabled={compensation.saving || !selected}
              id="assignment-value"
              inputMode="decimal"
              onChange={(event) => setValue(event.target.value)}
              type="number"
              value={value}
            />
            {selected && (
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
              disabled={compensation.saving || !payComponentId || !effectiveFrom}
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
