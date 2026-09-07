'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label, Select } from '@smarteam/ui';

/**
 * Opening a timesheet period, and deriving the sheets for it.
 *
 * Until this existed there was no way to do either from inside the product. The API had both
 * routes and the admin hook had both calls, but nothing rendered a control for them — so no
 * period was ever opened, and every employee's timesheet screen said "timesheets appear once an
 * administrator opens a period" about a thing no administrator could do. Employees could not log
 * time at all.
 *
 * Deriving is offered as part of the same action rather than a separate screen: a period with no
 * sheets in it is not useful to anybody, and splitting the two is what let the first half happen
 * without the second.
 */
export function OpenPeriodDialog({
  isOpen,
  onClose,
  onOpen,
  saveError,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (input: {
    periodType: string;
    periodStart: string;
    periodEnd: string;
  }) => Promise<boolean>;
  saveError: string | null;
  saving: boolean;
}) {
  const [periodType, setPeriodType] = useState('WEEKLY');
  const [periodStart, setPeriodStart] = useState(() => isoToday());
  const [periodEnd, setPeriodEnd] = useState(() => isoPlusDays(6));
  const [done, setDone] = useState<string | null>(null);

  const ready = periodStart.length === 10 && periodEnd.length === 10 && periodEnd >= periodStart;

  const submit = async () => {
    if (!ready) return;
    const opened = await onOpen({ periodType, periodStart, periodEnd });
    if (!opened) return;
    setDone('Period opened and timesheets created. Employees can log time against it now.');
  };

  const close = () => {
    setDone(null);
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={isOpen}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Open a timesheet period
        </DialogTitle>

        <div className="space-y-4 p-5">
          {done ? (
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
              {done}
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                A period is the window employees log time against. Opening one creates a timesheet
                for each employee from their recorded attendance.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="period-type">Period type</Label>
                <Select
                  id="period-type"
                  onChange={(event) => setPeriodType(event.target.value)}
                  value={periodType}
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Fortnightly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="CUSTOM">Custom</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="period-start">Starts</Label>
                  <Input
                    id="period-start"
                    onChange={(event) => setPeriodStart(event.target.value)}
                    type="date"
                    value={periodStart}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="period-end">Ends</Label>
                  <Input
                    id="period-end"
                    onChange={(event) => setPeriodEnd(event.target.value)}
                    type="date"
                    value={periodEnd}
                  />
                </div>
              </div>

              {periodEnd < periodStart && (
                <p className="text-[11px] font-semibold text-destructive">
                  The end date cannot be before the start date.
                </p>
              )}
            </>
          )}

          {saveError && (
            <p className="text-[11px] font-semibold text-destructive" role="alert">
              {saveError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          {done ? (
            <Button onClick={close} type="button">
              Done
            </Button>
          ) : (
            <>
              <Button disabled={saving} onClick={close} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={saving || !ready} onClick={() => void submit()} type="button">
                {saving ? 'Opening…' : 'Open period'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
