'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { useAdvanceRules } from '../../hooks/use-advance-rules';

/**
 * Salary advances, company-wide: how much anyone may ask for, and how it is paid back.
 *
 * The limit covers everything a person is waiting on and still repaying together, so two small
 * requests cannot get round it. Repayment in more than one month takes an equal share from each
 * payslip until the advance is cleared.
 */
export function AdvanceRulesCard() {
  const advance = useAdvanceRules();
  const [limit, setLimit] = useState('');
  const [months, setMonths] = useState('');

  useEffect(() => {
    if (!advance.rules) return;
    setLimit(String(advance.rules.limitPercent));
    setMonths(String(advance.rules.recoveryMonths));
  }, [advance.rules]);

  if (!advance.canWrite || !advance.rules) return null;

  const whole = (value: string, min: number, max: number) =>
    /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;
  const valid = whole(limit, 0, 100) && whole(months, 1, 24);
  const off = valid && Number(limit) === 0;

  return (
    <form
      className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || advance.saving) return;
        void advance.save({ limitPercent: Number(limit), recoveryMonths: Number(months) });
      }}
    >
      <div>
        <h3 className="text-sm font-bold text-foreground">Salary advances</h3>
        <p className="text-xs text-muted-foreground">
          How much an employee may ask for, and how it is paid back. The limit counts what they are
          waiting on and still repaying, so several small requests cannot add up to more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs font-semibold" htmlFor="advance-limit">
            Limit (% of monthly gross salary)
          </Label>
          <Input
            className="h-10 font-mono text-sm font-semibold"
            disabled={advance.saving}
            id="advance-limit"
            inputMode="numeric"
            max={100}
            min={0}
            onChange={(event) => setLimit(event.target.value)}
            type="number"
            value={limit}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {off ? 'Advances are turned off: nobody can request one.' : '0 turns advances off.'}
          </p>
        </div>
        <div>
          <Label className="mb-1 block text-xs font-semibold" htmlFor="advance-months">
            Paid back over (months)
          </Label>
          <Input
            className="h-10 font-mono text-sm font-semibold"
            disabled={advance.saving}
            id="advance-months"
            inputMode="numeric"
            max={24}
            min={1}
            onChange={(event) => setMonths(event.target.value)}
            type="number"
            value={months}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {Number(months) > 1
              ? `An equal share comes out of each of the next ${months} payslips.`
              : 'The whole advance comes out of the next payslip.'}
          </p>
        </div>
      </div>

      {advance.saveError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {advance.saveError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          A new limit applies to the next request. A new repayment period applies to advances still
          being repaid, and marks calculated payroll runs stale.
        </p>
        <Button disabled={!valid || advance.saving} size="sm" type="submit">
          {advance.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
