'use client';

import React, { useEffect, useState } from 'react';
import { Button, LoadingIndicator } from '@smarteam/ui';
import { useWorkWeek } from '../../hooks/use-work-week';

const DAYS = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 7, label: 'Sunday' },
];

/**
 * Which days are working days. The rest are weekly offs: not expected at work, never counted as
 * an absence, and not charged as leave. Changing this marks unreleased payroll for this month
 * for recalculation.
 */
export function WorkWeekPanel() {
  const week = useWorkWeek();
  const [selected, setSelected] = useState<number[]>(week.workWeekDays);
  const [absent, setAbsent] = useState(week.unmarkedDaysAreAbsent);
  const [saved, setSaved] = useState(false);
  const savedDaysKey = week.workWeekDays.join(',');
  useEffect(() => setSelected(savedDaysKey.split(',').map(Number)), [savedDaysKey]);
  useEffect(() => setAbsent(week.unmarkedDaysAreAbsent), [week.unmarkedDaysAreAbsent]);

  const toggle = (day: number) => {
    setSaved(false);
    setSelected((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  };
  const changed =
    [...selected].sort().join() !== [...week.workWeekDays].sort().join() ||
    absent !== week.unmarkedDaysAreAbsent;

  if (week.loading) return <LoadingIndicator label="Loading working days" />;
  if (week.error || !week.ready) return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-xs text-destructive" role="alert">{week.error || 'Working days are unavailable.'}</p>
      <Button onClick={() => void week.refetch()} size="sm" type="button" variant="outline">Retry</Button>
    </section>
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Working days</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Unticked days are weekly offs. Payroll counts a working day with no attendance or leave as
          an absence, and leave requests are charged only for working days. Select Saturday or Sunday
          whenever your organization works those days.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This is the recurring organization schedule. Employees with an assigned shift follow that
          shift&apos;s working days. Holidays and approved leave still apply.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
        {DAYS.map(({ day, label }) => {
          const on = selected.includes(day);
          return (
            <button
              aria-pressed={on}
              className={`min-h-9 min-w-12 rounded-md border px-3 text-xs font-semibold transition-colors ${
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              disabled={!week.canWrite || week.saving}
              key={day}
              onClick={() => toggle(day)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && <p className="text-xs text-destructive" role="alert">Select at least one working day.</p>}
      <label className="flex items-start gap-2 text-xs text-foreground">
        <input
          checked={absent}
          className="mt-0.5"
          disabled={!week.canWrite || week.saving}
          onChange={(event) => {
            setSaved(false);
            setAbsent(event.target.checked);
          }}
          type="checkbox"
        />
        <span>
          <span className="font-semibold">Count a working day with no attendance as absent</span>
          <span className="block text-muted-foreground">
            One day&apos;s pay is deducted for each (loss of pay). Turn this off if some staff do
            not record attendance.
          </span>
        </span>
      </label>
      {week.saveError && (
        <p className="text-xs text-destructive" role="alert">
          {week.saveError}
        </p>
      )}
      {saved && !changed && (
        <p className="text-xs text-muted-foreground" role="status">
          Working days saved. Calendars and attendance now follow this schedule.
        </p>
      )}
      {week.canWrite && (
        <Button
          disabled={!changed || selected.length === 0 || week.saving}
          onClick={async () =>
            setSaved(await week.save({ workWeekDays: selected, unmarkedDaysAreAbsent: absent }))
          }
          size="sm"
          type="button"
        >
          {week.saving ? 'Saving…' : 'Save'}
        </Button>
      )}
    </section>
  );
}
