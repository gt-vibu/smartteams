'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@smarteam/ui';
import { useWorkWeek } from '../../hooks/use-work-week';

const DAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
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
  useEffect(() => setSelected(week.workWeekDays), [week.workWeekDays]);
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

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Working days</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Unticked days are weekly offs. Payroll counts a working day with no attendance or leave as
          an absence, and leave requests are charged only for working days.
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
          Working days saved.
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
