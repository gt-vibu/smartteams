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
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smarteam/ui';
import type { Shift } from '@smarteam/contracts';
import type { ShiftsState } from '../../hooks/use-shifts';
import { useEmployees } from '../../hooks/use-workforce';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

/** Creates or edits a shift. Times are `HH:MM`, which is what the API stores. */
export function ShiftDialog({
  shifts,
  shift,
  open,
  onOpenChange,
}: {
  shifts: ShiftsState;
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startsAt, setStartsAt] = useState('09:00');
  const [endsAt, setEndsAt] = useState('18:00');
  const [breakMinutes, setBreakMinutes] = useState('60');

  useEffect(() => {
    if (!open) return;
    setCode(shift?.code ?? '');
    setName(shift?.name ?? '');
    setDaysOfWeek(shift?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setStartsAt(shift ? shift.startsAt.slice(0, 5) : '09:00');
    setEndsAt(shift ? shift.endsAt.slice(0, 5) : '18:00');
    setBreakMinutes(String(shift?.breakMinutes ?? 60));
  }, [open, shift]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim() || daysOfWeek.length === 0) return;
    // A shift ending before it starts runs past midnight; the backend needs that stated.
    const crossesMidnight = endsAt <= startsAt;
    const input = {
      code: code.trim(),
      name: name.trim(),
      daysOfWeek: [...daysOfWeek].sort((a, b) => a - b),
      startsAt,
      endsAt,
      crossesMidnight,
      breakMinutes: Number(breakMinutes) || 0,
    };
    const ok = shift ? await shifts.updateShift(shift.id, input) : await shifts.createShift(input);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{shift ? 'Edit shift' : 'New shift'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="shift-code">
                Code
              </Label>
              <Input
                disabled={shifts.saving}
                id="shift-code"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="shift-name">
                Name
              </Label>
              <Input
                disabled={shifts.saving}
                id="shift-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-foreground">Working days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = daysOfWeek.includes(day.value);
                return (
                  <Button
                    className={`px-3 ${on ? '' : 'text-muted-foreground'}`}
                    key={day.value}
                    onClick={() =>
                      setDaysOfWeek(
                        on
                          ? daysOfWeek.filter((entry) => entry !== day.value)
                          : [...daysOfWeek, day.value],
                      )
                    }
                    size="sm"
                    type="button"
                    variant={on ? 'default' : 'outline'}
                  >
                    {day.label}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="shift-start">
                Starts
              </Label>
              <Input
                disabled={shifts.saving}
                id="shift-start"
                onChange={(event) => setStartsAt(event.target.value)}
                type="time"
                value={startsAt}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="shift-end">
                Ends
              </Label>
              <Input
                disabled={shifts.saving}
                id="shift-end"
                onChange={(event) => setEndsAt(event.target.value)}
                type="time"
                value={endsAt}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="shift-break">
                Break (min)
              </Label>
              <Input
                disabled={shifts.saving}
                id="shift-break"
                inputMode="numeric"
                onChange={(event) => setBreakMinutes(event.target.value)}
                type="number"
                value={breakMinutes}
              />
            </div>
          </div>

          {endsAt <= startsAt && (
            <p className="text-[11px] text-muted-foreground">
              This shift ends on the following day and will be saved as crossing midnight.
            </p>
          )}

          {shifts.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {shifts.saveError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              disabled={shifts.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={shifts.saving} type="submit">
              {shifts.saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Assigns a shift to an employee for a period. */
export function AssignShiftDialog({
  shifts,
  shift,
  open,
  onOpenChange,
}: {
  shifts: ShiftsState;
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const employees = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shift || !employeeId || !startsOn) return;
    const ok = await shifts.assignShift(employeeId, {
      shiftId: shift.id,
      startsOn,
      ...(endsOn ? { endsOn } : {}),
    });
    if (ok) {
      setEmployeeId('');
      setStartsOn('');
      setEndsOn('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Assign {shift?.name ?? 'shift'}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          An employee cannot hold two shifts over the same dates; the server refuses an overlap.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block">Employee</Label>
            <SelectMenu onValueChange={setEmployeeId} value={employeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {(employees.data ?? []).map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName} · {employee.employeeNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="assignment-starts">
                Starts on
              </Label>
              <DatePicker
                disabled={shifts.saving}
                id="assignment-starts"
                max={endsOn || undefined}
                onChange={setStartsOn}
                value={startsOn}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="assignment-ends">
                Ends on
              </Label>
              <DatePicker
                disabled={shifts.saving}
                id="assignment-ends"
                min={startsOn || undefined}
                onChange={setEndsOn}
                placeholder="Open ended"
                value={endsOn}
              />
            </div>
          </div>
          {shifts.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {shifts.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={shifts.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={shifts.saving || !employeeId || !startsOn} type="submit">
              {shifts.saving ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Retires a shift. The reason is required by the API and recorded in the audit trail. */
export function RetireShiftDialog({
  shifts,
  shift,
  open,
  onOpenChange,
}: {
  shifts: ShiftsState;
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shift || reason.trim().length < 2) return;
    const ok = await shifts.retireShift(shift.id, reason.trim());
    if (ok) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Retire {shift?.name ?? 'shift'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Label className="block" htmlFor="retire-reason">
            Reason
          </Label>
          <Textarea
            disabled={shifts.saving}
            id="retire-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          {shifts.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {shifts.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={shifts.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={shifts.saving || reason.trim().length < 2} type="submit">
              {shifts.saving ? 'Retiring...' : 'Retire'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
