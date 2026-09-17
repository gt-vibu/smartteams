'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import type { Holiday } from '@smarteam/contracts';
import type { HolidaysState } from '../../hooks/use-holidays';
import { ShadcnDatePicker, type HolidayAdminGroup } from './holiday-dialogs-shared';

/**
 * Adds a holiday (single day or multi-day range), or renames one/a plan group.
 */
export function HolidayDialog({
  holidays,
  holiday,
  holidayGroup,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday?: Holiday | null;
  holidayGroup?: HolidayAdminGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isOptional, setIsOptional] = useState(false);

  const activeTargetGroup =
    holidayGroup ??
    (holiday
      ? {
          name: holiday.name,
          isOptional: holiday.isOptional,
          branchId: holiday.branchId ?? null,
          isActive: holiday.isActive,
          startDate: holiday.holidayDate.slice(0, 10),
          endDate: holiday.holidayDate.slice(0, 10),
          totalDays: 1,
          holidays: [holiday],
        }
      : null);

  useEffect(() => {
    if (!open) return;
    setName(activeTargetGroup?.name ?? '');
    setStartDate(activeTargetGroup?.startDate ?? '');
    setEndDate(
      activeTargetGroup && activeTargetGroup.totalDays > 1 ? activeTargetGroup.endDate : '',
    );
    setIsOptional(activeTargetGroup?.isOptional ?? false);
  }, [activeTargetGroup, open]);

  const dayCount = useMemo(() => {
    if (!startDate) return 0;
    if (!endDate || endDate <= startDate) return 1;
    const s = new Date(`${startDate}T00:00:00Z`);
    const e = new Date(`${endDate}T00:00:00Z`);
    return Math.min(365, Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1);
  }, [startDate, endDate]);

  const isRange = endDate && endDate > startDate;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    let ok: unknown;
    if (activeTargetGroup) {
      if (activeTargetGroup.holidays.length > 1) {
        ok = await holidays.renameHolidayGroup(
          activeTargetGroup.holidays.map((h) => h.id),
          { name: name.trim(), isOptional },
        );
      } else if (activeTargetGroup.holidays[0]) {
        ok = await holidays.renameHoliday(activeTargetGroup.holidays[0].id, {
          name: name.trim(),
          isOptional,
        });
      }
    } else if (startDate) {
      if (isRange) {
        ok = await holidays.createHolidayRange(
          { name: name.trim(), isOptional },
          startDate,
          endDate,
        );
      } else {
        ok = await holidays.createHoliday({
          name: name.trim(),
          holidayDate: startDate,
          isOptional,
        });
      }
    }
    if (ok) onOpenChange(false);
  };

  const isEditing = Boolean(activeTargetGroup);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{isEditing ? 'Rename holiday plan' : 'Add a holiday'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="holiday-name">
              Holiday / Plan Name
            </Label>
            <Input
              autoFocus
              disabled={holidays.saving}
              id="holiday-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Diwali"
              value={name}
            />
          </div>

          {isEditing ? (
            <p className="text-[11px] text-muted-foreground font-mono">
              {activeTargetGroup!.totalDays > 1
                ? `${activeTargetGroup!.startDate} → ${activeTargetGroup!.endDate} (${activeTargetGroup!.totalDays} days)`
                : activeTargetGroup!.startDate}{' '}
              · the dates cannot be changed, because leave already charged against them was
              calculated from them.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label
                  className="mb-1 block text-xs font-semibold text-foreground"
                  htmlFor="holiday-start"
                >
                  Date
                </Label>
                <ShadcnDatePicker
                  disabled={holidays.saving}
                  id="holiday-start"
                  onChange={setStartDate}
                  placeholder="Pick date"
                  value={startDate}
                />
              </div>

              <div>
                <Label className="mb-1 flex items-center justify-between" htmlFor="holiday-end">
                  <span className="text-xs font-semibold text-foreground">End date</span>
                  <span className="font-normal text-[11px] text-muted-foreground">
                    optional · leave blank for a single day
                  </span>
                </Label>
                <ShadcnDatePicker
                  disabled={holidays.saving || !startDate}
                  id="holiday-end"
                  min={startDate}
                  onChange={setEndDate}
                  placeholder={startDate ? 'Pick end date' : 'Select date first'}
                  value={endDate}
                />
              </div>

              {startDate && (
                <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Creates:</span>
                  <span className="font-semibold text-foreground">
                    {dayCount} day{dayCount !== 1 ? 's' : ''}
                  </span>
                  {isRange && (
                    <span className="text-muted-foreground">
                      {startDate} → {endDate}
                    </span>
                  )}
                  {dayCount > 14 && (
                    <span className="ml-auto rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">
                      large range
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
            <input
              checked={isOptional}
              disabled={holidays.saving}
              onChange={(event) => setIsOptional(event.target.checked)}
              type="checkbox"
            />
            Optional holiday (adds to the optional pool)
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
              disabled={holidays.saving || (!isEditing && !startDate) || name.trim().length < 2}
              type="submit"
            >
              {holidays.saving
                ? 'Saving...'
                : !isEditing && isRange
                  ? `Add ${dayCount} days`
                  : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
