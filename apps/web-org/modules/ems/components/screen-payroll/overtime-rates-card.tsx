'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { useOvertimeRates } from '../../hooks/use-overtime-rates';

/**
 * What overtime pays, company-wide.
 *
 * Three multiples of the ordinary hourly rate. `Standard` is what a new salary starts at — each
 * employee's own multiplier is what their overtime is actually paid at, so changing this does
 * not re-price anyone already on the payroll. The other two do: overtime attendance recorded on
 * a weekly off or a public holiday is paid at that rate instead, for everyone. Left blank they
 * pay the employee's own multiplier, which is what happened before these existed.
 */
export function OvertimeRatesCard() {
  const rates = useOvertimeRates();
  const [standard, setStandard] = useState('');
  const [weeklyOff, setWeeklyOff] = useState('');
  const [holiday, setHoliday] = useState('');

  useEffect(() => {
    if (!rates.rates) return;
    setStandard(String(rates.rates.standard));
    setWeeklyOff(rates.rates.weeklyOff === null ? '' : String(rates.rates.weeklyOff));
    setHoliday(rates.rates.holiday === null ? '' : String(rates.rates.holiday));
  }, [rates.rates]);

  if (!rates.canRead) return null;

  const optional = (value: string) => (value.trim() === '' ? null : Number(value));
  const inRange = (value: number | null) =>
    value === null || (Number.isFinite(value) && value >= 1 && value <= 5);
  const valid =
    Number.isFinite(Number(standard)) &&
    Number(standard) >= 1 &&
    Number(standard) <= 5 &&
    inRange(optional(weeklyOff)) &&
    inRange(optional(holiday));

  const fields: Array<[string, string, string, (value: string) => void, string]> = [
    ['ot-standard', 'Standard', standard, setStandard, 'Default for a new salary'],
    ['ot-weekly-off', 'Weekly off', weeklyOff, setWeeklyOff, 'Blank pays the standard rate'],
    ['ot-holiday', 'Public holiday', holiday, setHoliday, 'Blank pays the standard rate'],
  ];

  return (
    <form
      className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || rates.saving) return;
        void rates.save({
          standard: Number(standard),
          weeklyOff: optional(weeklyOff),
          holiday: optional(holiday),
        });
      }}
    >
      <div>
        <h3 className="text-sm font-bold text-foreground">Overtime rates</h3>
        <p className="text-xs text-muted-foreground">
          Multiples of the ordinary hourly rate. Overtime on a weekly off or a public holiday is
          paid at its own rate; anything else is paid at the employee&apos;s own multiplier.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {fields.map(([id, label, value, setValue, hint]) => (
          <div key={id}>
            <Label className="mb-1 block text-xs font-semibold" htmlFor={id}>
              {label}
            </Label>
            <Input
              className="h-10 font-mono text-sm font-semibold"
              disabled={!rates.canWrite || rates.saving}
              id={id}
              inputMode="decimal"
              max={5}
              min={1}
              onChange={(event) => setValue(event.target.value)}
              placeholder={id === 'ot-standard' ? '1.5' : 'Same as standard'}
              step="0.1"
              type="number"
              value={value}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      {rates.saveError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {rates.saveError}
        </p>
      )}

      {rates.canWrite && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Changing a rate marks calculated payroll runs stale so they are priced again.
          </p>
          <Button disabled={!valid || rates.saving} size="sm" type="submit">
            {rates.saving ? 'Saving…' : 'Save rates'}
          </Button>
        </div>
      )}
    </form>
  );
}
