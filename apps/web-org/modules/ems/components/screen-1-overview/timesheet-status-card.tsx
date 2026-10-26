import React from 'react';
import { formatWorkMinutes, type Timesheet, formatDate } from '@smarteam/contracts';
import { statusLabel } from '../../lib/status-label';

/** The most recently approved timesheet, shown as a confirmation on the overview screen. */
export function TimesheetStatusCard({ notification }: { notification: Timesheet }) {
  return (
    <div className="flex w-full min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">Timesheet approved</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {notification.period
            ? `${formatDate(notification.period.periodStart)} to ${formatDate(notification.period.periodEnd)}`
            : 'Current period'}
          {' · '}
          {formatWorkMinutes(notification.totalMinutes)}
        </p>
      </div>
      <span className="shrink-0 rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {statusLabel(notification.status)}
      </span>
    </div>
  );
}
