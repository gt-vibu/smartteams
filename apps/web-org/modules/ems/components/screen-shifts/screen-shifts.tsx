'use client';

import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { LoadingIndicator, Button } from '@smarteam/ui';
import { formatWeekdays, shiftMinutes, type Shift } from '@smarteam/contracts';
import { useShifts } from '../../hooks/use-shifts';
import { RotationDialog } from './rotation-dialog';
import { AssignShiftDialog, RetireShiftDialog, ShiftDialog } from './shift-dialogs';
import { ShiftAssignmentsDialog } from './shift-assignments-dialog';
import { BulkWorkforcePanel } from '../common/bulk-workforce-panel';
import { PageShell } from '../layout/page-shell';

/**
 * Shifts.
 *
 * A new screen rather than a reconciled one: the backend has supported shift definitions,
 * updates, retirement and effective-dated employee assignment all along, and nothing in the
 * product ever called it. The only fixture involved, `shifts.json`, seeded a browser storage key
 * that no screen read.
 *
 * Attendance compares punches with the assigned shift; payroll uses a flat-day basis.
 */
export function ScreenShifts() {
  const shifts = useShifts();
  const [showOvernight, setShowOvernight] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [template, setTemplate] = useState<Shift | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Shift | null>(null);
  const [retiring, setRetiring] = useState<Shift | null>(null);
  const [viewingPeople, setViewingPeople] = useState<Shift | null>(null);
  const overnightCount = shifts.shifts.filter((shift) => shift.crossesMidnight).length;
  const visibleShifts = showOvernight
    ? shifts.shifts.filter((shift) => shift.crossesMidnight)
    : shifts.shifts;

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
            <div className="flex flex-wrap gap-2">
              {shifts.shifts.length >= 2 && (
                <Button onClick={() => setRotating(true)} size="sm" type="button" variant="outline">
                  Rotating roster
                </Button>
              )}
              <Button onClick={() => setCreating(true)} size="sm" type="button">
                New shift
              </Button>
            </div>
          )
        }
        icon={CalendarClock}
        description="Manage work schedules and review assigned shift patterns."
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
        <LoadingIndicator variant="panel" label="Loading shifts" className="py-10 text-center text-xs text-muted-foreground" />
      )}

      {!shifts.loading && !shifts.error && (
        <section aria-label="Shift summary" className="grid grid-cols-2 gap-2">
          <button aria-pressed={!showOvernight} className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowOvernight(false)} type="button">
            <span className="text-[11px] text-muted-foreground">Active shifts</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{shifts.shifts.length}</span><span className="text-[10px] text-muted-foreground">Active schedules in your access scope</span>
          </button>
          <button aria-pressed={showOvernight} className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowOvernight((value) => !value)} type="button">
            <span className="text-[11px] text-muted-foreground">Overnight shifts</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{overnightCount}</span><span className="text-[10px] text-muted-foreground">Click to review cross-midnight schedules</span>
          </button>
        </section>
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

      {!shifts.loading && !shifts.error && visibleShifts.length === 0 && (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-bold text-foreground">{showOvernight ? 'No overnight shifts' : 'No shifts'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to define the hours attendance is measured against.
          </p>
        </div>
      )}

      {!shifts.loading && !shifts.error && visibleShifts.length > 0 && (
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
              {visibleShifts.map((shift) => {
                const minutes = shiftMinutes(shift);
                return (
                  <tr
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    key={shift.id}
                  >
                    <td data-cell="primary" className="px-4 py-2.5">
                      <span className="block font-semibold text-foreground">{shift.name}</span>
                    </td>
                    <td data-label="Days" className="px-4 py-2.5 text-muted-foreground">
                      {formatWeekdays(shift.daysOfWeek)}
                    </td>
                    <td data-label="Hours" className="px-4 py-2.5 font-mono text-muted-foreground">
                      {shift.startsAt.slice(0, 5)} – {shift.endsAt.slice(0, 5)}
                      {shift.crossesMidnight && <span className="ml-1 text-[10px]">(+1 day)</span>}
                    </td>
                    <td
                      data-label="Break"
                      className="px-4 py-2.5 tabular-nums text-muted-foreground"
                    >
                      {shift.breakMinutes}m
                    </td>
                    <td data-label="Net" className="px-4 py-2.5 tabular-nums text-foreground">
                      {Math.floor(minutes / 60)}h {minutes % 60}m
                    </td>
                    <td data-cell="actions" className="px-4 py-2.5 text-right">
                      <div className="flex w-full flex-wrap justify-start gap-2 sm:justify-end">
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
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => {
                                setEditing(null);
                                setTemplate(shift);
                                setCreating(true);
                              }}
                            >
                              Copy schedule
                            </Button>
                            <Button
                              onClick={() => setRetiring(shift)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Deactivate
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

      <BulkWorkforcePanel initialOperation="SHIFT" />
      <ShiftDialog
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
            setTemplate(null);
          }
        }}
        open={creating || editing !== null}
        template={template}
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
      <RotationDialog
        onClose={() => setRotating(false)}
        onPlanned={() => void shifts.refetch()}
        open={rotating}
        shifts={shifts.shifts}
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
