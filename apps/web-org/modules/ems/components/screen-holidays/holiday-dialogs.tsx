'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import type { Holiday } from '@smarteam/contracts';
import type { HolidaysState } from '../../hooks/use-holidays';

/**
 * Adds a holiday, or renames one.
 *
 * The date is only editable when adding. Moving an existing holiday would change what past leave
 * requests were charged, so the API does not accept it — retire the old one and add a new one.
 */
export function HolidayDialog({
  holidays,
  holiday,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday: Holiday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [isOptional, setIsOptional] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(holiday?.name ?? '');
    setHolidayDate(holiday ? holiday.holidayDate.slice(0, 10) : '');
    setIsOptional(holiday?.isOptional ?? false);
  }, [holiday, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    const ok = holiday
      ? await holidays.renameHoliday(holiday.id, { name: name.trim(), isOptional })
      : holidayDate
        ? await holidays.createHoliday({ name: name.trim(), holidayDate, isOptional })
        : false;
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{holiday ? 'Rename holiday' : 'Add a holiday'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="holiday-name">
              Name
            </Label>
            <Input
              disabled={holidays.saving}
              id="holiday-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>

          {holiday ? (
            <p className="text-[11px] text-muted-foreground">
              {holidayDate} · the date cannot be changed, because leave already charged against it
              was calculated from it.
            </p>
          ) : (
            <div>
              <Label className="mb-1 block" htmlFor="holiday-date">
                Date
              </Label>
              <DatePicker
                className="sm:w-52"
                disabled={holidays.saving}
                id="holiday-date"
                onChange={setHolidayDate}
                value={holidayDate}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              checked={isOptional}
              disabled={holidays.saving}
              onChange={(event) => setIsOptional(event.target.checked)}
              type="checkbox"
            />
            Optional holiday
          </label>

          {holidays.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {holidays.saveError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              disabled={holidays.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={holidays.saving || (!holiday && !holidayDate) || name.trim().length < 2}
              type="submit"
            >
              {holidays.saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Retires a holiday. The API requires a reason and keeps the row. */
export function RetireHolidayDialog({
  holidays,
  holiday,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday: Holiday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!holiday || reason.trim().length < 2) return;
    const ok = await holidays.retireHoliday(holiday.id, reason.trim());
    if (ok) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Retire {holiday?.name ?? 'holiday'}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          The holiday stops applying to future leave calculations. Leave already approved keeps the
          days it was charged.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Label className="block" htmlFor="holiday-retire-reason">
            Reason
          </Label>
          <Textarea
            disabled={holidays.saving}
            id="holiday-retire-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          {holidays.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {holidays.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={holidays.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={holidays.saving || reason.trim().length < 2} type="submit">
              {holidays.saving ? 'Retiring...' : 'Retire'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
