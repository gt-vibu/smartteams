'use client';

import React from 'react';
import { useTimesheet } from '../../hooks/use-timesheet';
import { TimesheetStatusCard } from './timesheet-status-card';

/** Compact timesheet summary for the overview screen, reading the same API as the time tracker. */
export function OverviewTimesheetPreviewTab() {
  const timesheet = useTimesheet();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Total', timesheet.summary.totalLabel],
          ['Submitted', timesheet.summary.submittedLabel],
          ['Approved', timesheet.summary.approvedLabel],
          ['Not submitted', timesheet.summary.notSubmittedLabel],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-border bg-card p-3.5" key={label}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {timesheet.approvedTimesheet && (
        <TimesheetStatusCard notification={timesheet.approvedTimesheet} />
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-xs font-semibold text-foreground">Recent time entries</h4>
        </div>

        {timesheet.groupedLogs.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">No time logged yet.</p>
        ) : (
          timesheet.groupedLogs.slice(0, 4).map((group) => (
            <div
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={group.workDate}
            >
              <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {group.workDate}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {group.totalLabel}
                </span>
              </div>
              {group.entries.map((entry) => (
                <div className="flex items-center justify-between gap-3 px-4 py-2" key={entry.id}>
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {entry.description ?? 'No description'}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.label}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
