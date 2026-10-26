'use client';

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import type { HolidaysState } from '../../hooks/use-holidays';
import { ShadcnDatePicker } from './holiday-dialogs-shared';

type HolidayDraft = {
  key: number;
  name: string;
  startDate: string;
  endDate: string;
  isOptional: boolean;
};

function emptyDraftRows(startKey: number): HolidayDraft[] {
  return [
    { key: startKey, name: '', startDate: '', endDate: '', isOptional: false },
    { key: startKey + 1, name: '', startDate: '', endDate: '', isOptional: false },
  ];
}

function datesInDraft(row: HolidayDraft): number {
  if (!row.startDate) return 0;
  if (!row.endDate || row.endDate === row.startDate) return 1;
  const start = new Date(`${row.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${row.endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

export function HolidayBulkQuickAddDialog({
  holidays,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<HolidayDraft[]>(() => emptyDraftRows(1));
  const [nextKey, setNextKey] = useState(3);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const holidayCount = rows.reduce((total, row) => total + datesInDraft(row), 0);
  const update = (key: number, values: Partial<HolidayDraft>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...values } : row)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const invalid = rows.filter(
      (row) =>
        row.name.trim().length < 2 ||
        !row.startDate ||
        (row.endDate && row.endDate < row.startDate),
    );
    if (invalid.length) {
      return setError(
        'Add a name and start date for each row. The end date must be on or after the start date.',
      );
    }
    const saved: number[] = [];
    const failed: HolidayDraft[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      setProgress(`Adding ${index + 1} of ${rows.length}…`);
      const ok = row.endDate
        ? await holidays.createHolidayRange(
            { name: row.name.trim(), isOptional: row.isOptional },
            row.startDate,
            row.endDate,
          )
        : await holidays.createHoliday({
            name: row.name.trim(),
            holidayDate: row.startDate,
            isOptional: row.isOptional,
          });
      if (ok) saved.push(row.key);
      else failed.push(row);
    }
    setProgress('');
    if (!failed.length) {
      onOpenChange(false);
      setRows(emptyDraftRows(nextKey));
      setNextKey(nextKey + 2);
      return;
    }
    setRows(failed);
    setError(
      `${saved.length} holiday${saved.length === 1 ? '' : 's'} added. Review the remaining rows and try again.`,
    );
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!progress) onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Quick add multiple holidays</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Add single-day holidays or inclusive date ranges. Choose whether each entry is compulsory
          or part of the optional holiday pool.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2 sm:items-end"
                key={row.key}
              >
                <div className="space-y-1">
                  <Label htmlFor={`holiday-bulk-name-${row.key}`}>Holiday {index + 1}</Label>
                  <Input
                    id={`holiday-bulk-name-${row.key}`}
                    maxLength={120}
                    onChange={(event) => update(row.key, { name: event.target.value })}
                    placeholder="e.g. Diwali"
                    value={row.name}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`holiday-bulk-start-${row.key}`}>From date</Label>
                  <ShadcnDatePicker
                    id={`holiday-bulk-start-${row.key}`}
                    onChange={(startDate) =>
                      update(row.key, {
                        startDate,
                        endDate: row.endDate && row.endDate < startDate ? '' : row.endDate,
                      })
                    }
                    placeholder="Pick start date"
                    value={row.startDate}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`holiday-bulk-end-${row.key}`}>
                    To date <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <ShadcnDatePicker
                    disabled={!row.startDate}
                    id={`holiday-bulk-end-${row.key}`}
                    min={row.startDate}
                    onChange={(endDate) => update(row.key, { endDate })}
                    placeholder={row.startDate ? 'Pick end date' : 'Choose a start date first'}
                    value={row.endDate}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`holiday-bulk-type-${row.key}`}>Holiday type</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={Boolean(progress)}
                    id={`holiday-bulk-type-${row.key}`}
                    onChange={(event) =>
                      update(row.key, { isOptional: event.target.value === 'optional' })
                    }
                    value={row.isOptional ? 'optional' : 'compulsory'}
                  >
                    <option value="compulsory">Compulsory · public holiday</option>
                    <option value="optional">Optional · restricted pool</option>
                  </select>
                </div>
                {rows.length > 1 && (
                  <Button
                    aria-label={`Remove holiday ${index + 1}`}
                    className="sm:mb-0.5"
                    onClick={() =>
                      setRows((current) => current.filter((entry) => entry.key !== row.key))
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            disabled={Boolean(progress)}
            onClick={() => {
              setRows((current) => [
                ...current,
                { key: nextKey, name: '', startDate: '', endDate: '', isOptional: false },
              ]);
              setNextKey((value) => value + 1);
            }}
            type="button"
            variant="outline"
          >
            + Add another holiday
          </Button>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {holidays.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {holidays.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button
              disabled={Boolean(progress)}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={Boolean(progress) || rows.length < 1} type="submit">
              {progress || `Add ${holidayCount} holiday date${holidayCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
