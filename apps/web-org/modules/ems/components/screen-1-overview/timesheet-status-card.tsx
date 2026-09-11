import React from 'react';
import { formatWorkMinutes, type Timesheet } from '@smarteam/contracts';

/** The most recently approved timesheet, shown as a confirmation on the overview screen. */
export function TimesheetStatusCard({ notification }: { notification: Timesheet }) {
  return (
    <div className="flex w-full min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">Timesheet approved</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {notification.period
            ? `${notification.period.periodStart.slice(0, 10)} to ${notification.period.periodEnd.slice(0, 10)}`
            : 'Current period'}
          {' · '}
          {formatWorkMinutes(notification.totalMinutes)}
        </p>
      </div>
      <span className="shrink-0 rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {notification.status}
      </span>
    </div>
  );
}
