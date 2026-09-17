'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
} from '@smarteam/ui';
import type { Shift, ShiftAssignment } from '@smarteam/contracts';
import { useShiftAssignments } from '../../hooks/use-shift-assignments';

const STATE_LABEL: Record<ShiftAssignment['state'], string> = {
  CURRENT: 'Current',
  UPCOMING: 'Upcoming',
  ENDED: 'Ended',
};

const personName = (assignment: ShiftAssignment) =>
  `${assignment.employee.firstName} ${assignment.employee.lastName ?? ''}`.trim();

/**
 * Who is on a shift, and ending an assignment.
 *
 * Moving someone to another shift used to be impossible: their open-ended assignment could not be
 * closed, and the new one overlapped it. Ending it here — on their last day — makes room for the
 * next assignment, which starts the day after.
 */
export function ShiftAssignmentsDialog({
  shift,
  canWrite,
  onOpenChange,
}: {
  shift: Shift | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [includeEnded, setIncludeEnded] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const assignments = useShiftAssignments(shift?.id ?? null, includeEnded);

  return (
    <Dialog open={shift !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>People on {shift?.name ?? 'this shift'}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          To move someone to another shift, end this assignment on their last day, then assign the
          other shift from the day after.
        </p>
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-foreground">
          <Checkbox
            checked={includeEnded}
            onCheckedChange={(checked) => setIncludeEnded(checked === true)}
          />
          Show ended assignments
        </label>

        <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
          {assignments.error && (
            <p role="alert" className="text-xs text-destructive">
              {assignments.error}
            </p>
          )}
          {!assignments.error && !assignments.loading && assignments.items.length === 0 && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
              {includeEnded
                ? 'Nobody has been assigned to this shift.'
                : 'Nobody is on this shift now or later.'}
            </p>
          )}
          {assignments.items.map((assignment) => (
            <div
              key={assignment.id}
              className="rounded-md border border-border bg-card px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {personName(assignment)}
                    {assignment.employee.employeeNumber && (
                      <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                        {assignment.employee.employeeNumber}
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {assignment.startsOn} → {assignment.endsOn ?? 'open-ended'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={assignment.state === 'ENDED' ? 'outline' : 'secondary'}>
                    {STATE_LABEL[assignment.state]}
                  </Badge>
                  {canWrite && assignment.state !== 'ENDED' && ending !== assignment.id && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setEnding(assignment.id)}
                    >
                      End
                    </Button>
                  )}
                </div>
              </div>
              {ending === assignment.id && (
                <EndAssignmentForm
                  assignment={assignment}
                  onCancel={() => setEnding(null)}
                  onSubmit={async (endsOn, reason) => {
                    await assignments.end(assignment.id, endsOn, reason);
                    setEnding(null);
                  }}
                />
              )}
            </div>
          ))}
          {assignments.loading && (
            <p role="status" className="py-2 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          )}
          {assignments.hasMore && !assignments.loading && (
            <Button
              className="w-full"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void assignments.loadMore()}
            >
              Load more
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The last day on the shift and why; nothing is prefilled, because the date is the admin's call. */
function EndAssignmentForm({
  assignment,
  onSubmit,
  onCancel,
}: {
  assignment: ShiftAssignment;
  onSubmit: (endsOn: string, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(endsOn) && reason.trim().length >= 3;

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(endsOn, reason.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assignment could not be ended.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2.5 grid gap-2 border-t border-border pt-2.5 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <div>
        <Label className="mb-1 block text-[11px]" htmlFor={`end-${assignment.id}`}>
          Last day on shift
        </Label>
        <DatePicker
          id={`end-${assignment.id}`}
          value={endsOn}
          onChange={setEndsOn}
          min={assignment.startsOn}
          max={assignment.endsOn ?? undefined}
          disabled={saving}
        />
      </div>
      <div>
        <Label className="mb-1 block text-[11px]" htmlFor={`end-reason-${assignment.id}`}>
          Reason
        </Label>
        <Input
          id={`end-reason-${assignment.id}`}
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Moving to the night shift"
          disabled={saving}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="button" disabled={!ready || saving} onClick={() => void submit()}>
          {saving ? 'Ending…' : 'End assignment'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}
