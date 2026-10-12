'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
} from '@smarteam/ui';
import { formatDateRange, type Shift } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useEmployees } from '../../hooks/use-workforce';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { EmployeePicker } from '../common/employee-picker';
import { localDateKey } from '../../lib/local-date';

type Result = {
  from: string;
  to: string;
  planned: number;
  results: Array<{ employeeId: string; planned: number; error?: string }>;
};

/** The next Monday, the natural first day of a roster. */
function nextMonday() {
  const day = new Date();
  day.setDate(day.getDate() + ((8 - (day.getDay() || 7)) % 7 || 7));
  return localDateKey(day);
}

/**
 * Plans a rotating roster: the chosen people cycle through the chosen shifts in order, a few
 * weeks on each. Staggering starts each person at a different shift, so every shift is covered
 * from the first week.
 */
export function RotationDialog({
  open,
  shifts,
  onClose,
  onPlanned,
}: {
  open: boolean;
  shifts: readonly Shift[];
  onClose: () => void;
  onPlanned: () => void;
}) {
  const { session } = useSession();
  const employees = useEmployees({ enabled: false });
  const [people, setPeople] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(2);
  const [total, setTotal] = useState(8);
  const [startsOn, setStartsOn] = useState(nextMonday);
  const [stagger, setStagger] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeople([]);
    setOrder([]);
    setError('');
    setResult(null);
  }, [open]);

  const toggleShift = (id: string) =>
    setOrder((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const submit = async () => {
    if (order.length < 2) return setError('Choose at least two shifts to rotate through.');
    if (people.length === 0) return setError('Choose who is on the roster.');
    setBusy(true);
    setError('');
    try {
      const planned = (await apiRequest(orgPath(session!.organizationId, '/shifts/rotations'), {
        method: 'POST',
        body: {
          employeeIds: people,
          shiftIds: order,
          weeksPerShift: weeks,
          totalWeeks: total,
          startsOn,
          stagger,
        },
      })) as Result;
      setResult(planned);
      onPlanned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The roster could not be planned.');
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => {
    const person = (employees.data ?? []).find((employee) => employee.id === id);
    return person ? `${person.firstName} ${person.lastName}` : 'Someone';
  };

  return (
    <Dialog onOpenChange={(next) => !next && !busy && onClose()} open={open}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-semibold">
          Plan a rotating roster
        </DialogTitle>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:max-h-[70vh]">
          {result ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-foreground">
                {result.planned} of {result.results.length} planned for{' '}
                {formatDateRange(result.from, result.to)}.
              </p>
              {result.results
                .filter((row) => row.error)
                .map((row) => (
                  <p className="text-destructive" key={row.employeeId}>
                    {nameOf(row.employeeId)}: {row.error}
                  </p>
                ))}
            </div>
          ) : (
            <>
              <div>
                <Label className="mb-1 block">Shifts, in the order people move through them</Label>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((shift) => {
                    const position = order.indexOf(shift.id);
                    return (
                      <Button
                        aria-pressed={position >= 0}
                        key={shift.id}
                        onClick={() => toggleShift(shift.id)}
                        size="sm"
                        type="button"
                        variant={position >= 0 ? 'default' : 'outline'}
                      >
                        {position >= 0 ? `${position + 1}. ` : ''}
                        {shift.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="mb-1 block" htmlFor="rotation-start">
                    Starts
                  </Label>
                  <DatePicker id="rotation-start" onChange={setStartsOn} value={startsOn} />
                </div>
                <div>
                  <Label className="mb-1 block" htmlFor="rotation-weeks">
                    Weeks on each
                  </Label>
                  <Input
                    id="rotation-weeks"
                    max={12}
                    min={1}
                    onChange={(event) =>
                      setWeeks(Math.max(1, Math.min(12, Number(event.target.value) || 1)))
                    }
                    type="number"
                    value={weeks}
                  />
                </div>
                <div>
                  <Label className="mb-1 block" htmlFor="rotation-total">
                    Plan for (weeks)
                  </Label>
                  <Input
                    id="rotation-total"
                    max={26}
                    min={1}
                    onChange={(event) =>
                      setTotal(Math.max(1, Math.min(26, Number(event.target.value) || 1)))
                    }
                    type="number"
                    value={total}
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs text-foreground">
                <Checkbox
                  checked={stagger}
                  className="mt-0.5"
                  onCheckedChange={(v) => setStagger(v === true)}
                />
                <span>
                  Stagger people across shifts
                  <span className="block text-[11px] text-muted-foreground">
                    So every shift is covered from the first week.
                  </span>
                </span>
              </label>
              <div>
                <Label className="mb-1 block">People on the roster</Label>
                <EmployeePicker
                  employees={employees.data ?? []}
                  onChange={setPeople}
                  selected={people}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error}
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              {result ? 'Done' : 'Cancel'}
            </Button>
            {!result && (
              <Button disabled={busy} onClick={() => void submit()} type="button">
                {busy ? 'Planning…' : 'Plan roster'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
