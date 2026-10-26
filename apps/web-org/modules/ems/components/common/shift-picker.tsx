'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SelectContent, SelectItem, SelectMenu, SelectTrigger, SelectValue } from '@smarteam/ui';
import type { Shift } from '@smarteam/contracts';
import { useShifts } from '../../hooks/use-shifts';
import { ShiftDialog } from '../screen-shifts/shift-dialogs';

const NONE = '__none__';
const NEW = '__new__';
const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "General · 09:00–18:00 · Mon–Fri" */
export function shiftLabel(shift: Shift) {
  const days = [...shift.daysOfWeek].sort((a, b) => a - b);
  const first = days[0];
  const last = days.at(-1);
  const consecutive = days.every((d, i) => i === 0 || d === (days[i - 1] ?? 0) + 1);
  const run =
    days.length > 1 && consecutive && first !== undefined && last !== undefined
      ? `${DAY[first]}–${DAY[last]}`
      : days.map((d) => DAY[d]).join(', ');
  return `${shift.name} · ${shift.startsAt.slice(0, 5)}–${shift.endsAt.slice(0, 5)} · ${run}`;
}

/**
 * Choosing a shift, with "+ New shift" for one that does not exist yet. The new shift is made with
 * the same form as the Shifts screen, saved to the server, and selected here once it appears.
 */
export function ShiftPicker({
  value,
  onChange,
  disabled = false,
  noneLabel = 'No shift',
}: {
  value: string;
  onChange: (shiftId: string) => void;
  disabled?: boolean;
  noneLabel?: string;
}) {
  const shifts = useShifts();
  const [creating, setCreating] = useState(false);
  const before = useRef<Set<string> | null>(null);
  const active = shifts.shifts
    .filter((shift) => shift.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Once the form closes, the shift that was not there before is the one just made.
  useEffect(() => {
    if (creating || !before.current) return;
    const added = shifts.shifts.find((shift) => !before.current?.has(shift.id));
    if (added) {
      onChange(added.id);
      before.current = null;
    }
  }, [creating, shifts.shifts, onChange]);

  return (
    <>
      <SelectMenu
        disabled={disabled}
        onValueChange={(next) => {
          if (next === NEW) {
            before.current = new Set(shifts.shifts.map((shift) => shift.id));
            setCreating(true);
          } else onChange(next === NONE ? '' : next);
        }}
        value={value || NONE}
      >
        <SelectTrigger>
          <SelectValue placeholder={noneLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {active.map((shift) => (
            <SelectItem key={shift.id} value={shift.id}>
              {shiftLabel(shift)}
            </SelectItem>
          ))}
          {shifts.canWrite && <SelectItem value={NEW}>+ New shift</SelectItem>}
        </SelectContent>
      </SelectMenu>
      <ShiftDialog onOpenChange={setCreating} open={creating} shift={null} shifts={shifts} />
    </>
  );
}
