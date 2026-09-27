'use client';

import React, { useRef } from 'react';
import { Button, useFocusTrap } from '@smarteam/ui';
import { entryNotes, type TimesheetEntry, formatDate } from '@smarteam/contracts';
import type { TimesheetAuditRow } from './timesheet-audit-row';

/**
 * The inspection panel for one timesheet.
 *
 * Approving or rejecting from here goes through the API and reports what came back; the previous
 * version mutated local state, so the button always "worked" and nothing was recorded.
 */
export function TimesheetAuditDrawer({
  busy,
  canDecide,
  onClose,
  onDecide,
  row,
}: {
  busy: boolean;
  canDecide: boolean;
  onClose: () => void;
  onDecide: (status: 'APPROVED' | 'REJECTED') => void;
  row: TimesheetAuditRow;
}) {
  // Focus stays in the panel and Escape closes it, as in every other drawer; neither did before.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, onClose);
  return (
    <div
      aria-label={`Timesheet of ${row.employeeName}`}
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
    >
      <button
        aria-label="Close inspection"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        type="button"
      />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
        ref={panelRef}
      >
        <div className="flex items-start justify-between border-b border-border p-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">{row.employeeName}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {row.employeeNumber}
            </p>
          </div>
          <StatusPill status={row.status} />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          <Field label="Period" value={row.period} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total logged" value={`${row.totalHours} hrs`} />
            <Field label="Overtime" value={`${row.overtimeHours} hrs`} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {row.entryCount} {row.entryCount === 1 ? 'entry' : 'entries'}
            </span>
            {row.entries.length === 0 ? (
              <p className="mt-1 rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                Nothing was logged in this period.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-2">
                {row.entries.map((entry) => (
                  <EntryCard entry={entry} key={entry.id} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/40 p-4">
          {row.status === 'SUBMITTED' && canDecide ? (
            <>
              <Button
                className="flex-1 py-2 text-xs font-bold"
                disabled={busy}
                onClick={() => onDecide('REJECTED')}
                variant="destructive"
              >
                Reject timesheet
              </Button>
              <Button
                className="flex-1 py-2 text-xs font-bold"
                disabled={busy}
                onClick={() => onDecide('APPROVED')}
                variant="success"
              >
                Approve timesheet
              </Button>
            </>
          ) : (
            <Button className="w-full py-2 text-xs font-bold" onClick={onClose} variant="default">
              Close inspection
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One logged entry as the employee filed it: the day, how long, what it was against, and the note
 * they wrote. Approvers were deciding on a total with no sight of what made it up.
 */
function EntryCard({ entry }: { entry: TimesheetEntry }) {
  const hours = Math.round((entry.minutes / 60) * 10) / 10;
  const notes = entryNotes(entry);
  const facts = [entry.projectName, entry.jobName, entry.workItem].filter(Boolean) as string[];
  const clock = entry.startTime && entry.endTime ? `${entry.startTime} – ${entry.endTime}` : null;

  return (
    <li className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold text-foreground">
          {formatDate(entry.workDate)}
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums text-foreground">
          {hours} hrs
          {entry.overtimeMinutes
            ? ` · ${Math.round((entry.overtimeMinutes / 60) * 10) / 10} OT`
            : ''}
        </span>
      </div>
      {clock && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{clock}</p>}
      {facts.length > 0 && (
        <p className="mt-1 text-[11px] font-medium text-foreground">{facts.join(' · ')}</p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {notes || 'No description was given.'}
      </p>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'APPROVED'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'REJECTED'
        ? 'bg-destructive/10 text-destructive'
        : status === 'SUBMITTED'
          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
          : 'bg-muted text-muted-foreground';
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${tone}`}>{status}</span>;
}
