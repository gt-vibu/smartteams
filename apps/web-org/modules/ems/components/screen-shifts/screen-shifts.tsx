'use client';

import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Button } from '@smarteam/ui';
import { formatWeekdays, shiftMinutes, type Shift } from '@smarteam/contracts';
import { useShifts } from '../../hooks/use-shifts';
import { AssignShiftDialog, RetireShiftDialog, ShiftDialog } from './shift-dialogs';
import { ShiftAssignmentsDialog } from './shift-assignments-dialog';
import { PageShell } from '../layout/page-shell';

/**
 * Shifts.
 *
 * A new screen rather than a reconciled one: the backend has supported shift definitions,
 * updates, retirement and effective-dated employee assignment all along, and nothing in the
 * product ever called it. The only fixture involved, `shifts.json`, seeded a browser storage key
 * that no screen read.
 *
 * What a shift does *not* do is stated on the screen: attendance prices punches against it, but
 * payroll prorates against a flat day basis, so a shift does not change anyone's pay.
 */
export function ScreenShifts() {
  const shifts = useShifts();
  const [editing, setEditing] = useState<Shift | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Shift | null>(null);
  const [retiring, setRetiring] = useState<Shift | null>(null);
  const [viewingPeople, setViewingPeople] = useState<Shift | null>(null);

  if (shifts.forbidden) {
    return (
      <PageShell>
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="status"
        >
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view shifts.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ScreenHeader
        actions={
          shifts.canWrite && (
            <Button onClick={() => setCreating(true)} size="sm" type="button">
              New shift
            </Button>
          )
        }
        description="Working patterns attendance measures against. Assignments are effective-dated; see and end them under People."
        icon={CalendarClock}
        title="Shifts"
        tone="accent"
      />
      {shifts.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {shifts.saveError}
        </p>
      )}

      {shifts.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading shifts...
        </p>
      )}

      {!shifts.loading && shifts.error && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-sm font-bold text-foreground">Could not load shifts</p>
          <p className="mt-1 text-xs text-muted-foreground">{shifts.error}</p>
          <Button
            className="mt-3"
            onClick={() => void shifts.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!shifts.loading && !shifts.error && shifts.shifts.length === 0 && (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-bold text-foreground">No shifts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to define the hours attendance is measured against.
          </p>
        </div>
      )}

      {!shifts.loading && !shifts.error && shifts.shifts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="stack-table w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-border bg-table-header">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Shift</th>
                <th className="px-4 py-2.5 font-bold">Days</th>
                <th className="px-4 py-2.5 font-bold">Hours</th>
                <th className="px-4 py-2.5 font-bold">Break</th>
                <th className="px-4 py-2.5 font-bold">Net</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shifts.shifts.map((shift) => {
                const minutes = shiftMinutes(shift);
                return (
                  <tr
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    key={shift.id}
                  >
                    <td data-cell="primary" className="px-4 py-2.5">
                      <span className="block font-semibold text-foreground">{shift.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {shift.code}
                      </span>
                    </td>
                    <td data-label="Days" className="px-4 py-2.5 text-muted-foreground">
                      {formatWeekdays(shift.daysOfWeek)}
                    </td>
                    <td data-label="Hours" className="px-4 py-2.5 font-mono text-muted-foreground">
                      {shift.startsAt.slice(0, 5)} – {shift.endsAt.slice(0, 5)}
                      {shift.crossesMidnight && <span className="ml-1 text-[10px]">(+1 day)</span>}
                    </td>
                    <td data-label="Break" className="px-4 py-2.5 font-mono text-muted-foreground">
                      {shift.breakMinutes}m
                    </td>
                    <td data-label="Net" className="px-4 py-2.5 font-mono text-foreground">
                      {Math.floor(minutes / 60)}h {minutes % 60}m
                    </td>
                    <td data-cell="actions" className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => setViewingPeople(shift)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          People
                        </Button>
                        {shifts.canWrite && (
                          <>
                            <Button
                              onClick={() => setAssigning(shift)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Assign
                            </Button>
                            <Button
                              onClick={() => setEditing(shift)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => setRetiring(shift)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Retire
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Attendance measures punches against an employee&apos;s assigned shift. Payroll prorates
        against a flat day basis and does not use shift hours.
      </p>

      <ShiftDialog
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
        shift={editing}
        shifts={shifts}
      />
      <AssignShiftDialog
        onOpenChange={(open) => !open && setAssigning(null)}
        open={assigning !== null}
        shift={assigning}
        shifts={shifts}
      />
      <ShiftAssignmentsDialog
        canWrite={shifts.canWrite}
        onOpenChange={(open) => !open && setViewingPeople(null)}
        shift={viewingPeople}
      />
      <RetireShiftDialog
        onOpenChange={(open) => !open && setRetiring(null)}
        open={retiring !== null}
        shift={retiring}
        shifts={shifts}
      />
    </PageShell>
  );
}
