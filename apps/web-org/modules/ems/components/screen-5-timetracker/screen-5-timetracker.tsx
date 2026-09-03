'use client';

import React, { useState } from 'react';
import { Badge, Button, SegmentedTabs } from '@smarteam/ui';
import { formatWorkMinutes, isEditable } from '@smarteam/contracts';
import { useTimesheet } from '../../hooks/use-timesheet';
import { LogTimeModal } from '../screen-6-logtime/logtime-modal';

/**
 * The employee's own time log.
 *
 * Entries come from the API, grouped by day. There is no project, task or billable column:
 * `ManualEntryDto` accepts a date, minutes, optional overtime and a description, so showing an
 * attribution the server never stores would be inventing data.
 */
export function Screen5TimeTracker() {
  const timesheet = useTimesheet();
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [periodId, setPeriodId] = useState<string | null>(null);

  const selected = timesheet.timesheets.find((sheet) => sheet.id === periodId) ?? timesheet.current;
  const groups = selected && selected.id === timesheet.current?.id ? timesheet.groupedLogs : [];

  const tabs = timesheet.timesheets.slice(0, 6).map((sheet) => ({
    id: sheet.id,
    label: sheet.period ? sheet.period.periodStart.slice(0, 10) : 'Period',
    tone:
      sheet.status === 'APPROVED'
        ? 'var(--success)'
        : sheet.status === 'REJECTED'
          ? 'var(--destructive)'
          : undefined,
  }));

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        {tabs.length > 0 && (
          <SegmentedTabs
            aria-label="Timesheet periods"
            items={tabs}
            onValueChange={setPeriodId}
            value={selected?.id ?? ''}
          />
        )}
        <div className="flex items-center gap-2 pb-2">
          {selected && isEditable(selected) && timesheet.canWrite && (
            <>
              <Button onClick={() => setIsLogOpen(true)} size="sm" type="button" variant="outline">
                Log time
              </Button>
              <Button
                disabled={timesheet.saving}
                onClick={() => void timesheet.submit(selected.id)}
                size="sm"
                type="button"
              >
                {timesheet.saving ? 'Submitting...' : 'Submit'}
              </Button>
            </>
          )}
        </div>
      </div>

      {timesheet.hasNoEmployeeRecord && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          This account has no employee record, so time cannot be logged.
        </p>
      )}

      {timesheet.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading timesheets...
        </p>
      )}

      {!timesheet.loading && timesheet.forbidden && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-semibold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view timesheets.
          </p>
        </div>
      )}

      {!timesheet.loading && timesheet.error && !timesheet.forbidden && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
          <p className="text-sm font-semibold text-foreground">Could not load timesheets</p>
          <p className="mt-1 text-xs text-muted-foreground">{timesheet.error}</p>
          <Button
            className="mt-3"
            onClick={() => void timesheet.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!timesheet.loading && !timesheet.error && (
        <>
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

          {timesheet.saveError && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {timesheet.saveError}
            </p>
          )}

          {selected && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={selected.status === 'APPROVED' ? 'secondary' : 'outline'}>
                {selected.status}
              </Badge>
              <span>
                {formatWorkMinutes(selected.regularMinutes)} regular ·{' '}
                {formatWorkMinutes(selected.overtimeMinutes)} overtime
              </span>
            </div>
          )}

          {groups.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <p className="text-sm font-semibold text-foreground">
                {timesheet.timesheets.length === 0 ? 'No timesheets' : 'No entries logged'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timesheet.timesheets.length === 0
                  ? 'Timesheets appear once an administrator opens a period and derives it.'
                  : 'Log time against this period to see it here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {groups.map((group) => (
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
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                      key={entry.id}
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {entry.description ?? 'No description'}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {entry.label}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <LogTimeModal
          isOpen={isLogOpen}
          onClose={() => setIsLogOpen(false)}
          onSubmit={(input) => timesheet.addEntry(selected.id, input)}
          saveError={timesheet.saveError}
          saving={timesheet.saving}
        />
      )}
    </div>
  );
}
