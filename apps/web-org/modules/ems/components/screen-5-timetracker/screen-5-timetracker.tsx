'use client';

import React, { useState } from 'react';
import { Badge, Button, SegmentedTabs } from '@smarteam/ui';
import { formatWorkMinutes } from '@smarteam/contracts';
import { useTimesheet } from '../../hooks/use-timesheet';
import { toDayGroups } from '../../services/timesheet-view';
import { LogTimeModal } from '../screen-6-logtime/logtime-modal';
import { PageShell } from '../layout/page-shell';
import { Briefcase, Clock, Plus } from 'lucide-react';

/**
 * The employee's own time log.
 *
 * Project-centric time tracking with Zoho People-style logging.
 * Entries come from the API, grouped by day. Supports logging unlimited (N) events
 * per day/period whenever required.
 */
export function Screen5TimeTracker() {
  const timesheet = useTimesheet();
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [periodId, setPeriodId] = useState<string | null>(null);

  const selected = timesheet.timesheets.find((sheet) => sheet.id === periodId) ?? timesheet.current;
  const groups = React.useMemo(() => toDayGroups(selected), [selected]);

  const tabs = timesheet.timesheets.slice(0, 10).map((sheet) => {
    const period = sheet.period;
    const label = period
      ? `${period.periodStart.slice(0, 10)}${period.periodType !== 'WEEKLY' ? ` (${period.periodType.toLowerCase()})` : ''}`
      : 'Period';
    return {
      id: sheet.id,
      label,
      tone:
        sheet.status === 'APPROVED'
          ? 'var(--success)'
          : sheet.status === 'REJECTED'
            ? 'var(--destructive)'
            : undefined,
    };
  });

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        {tabs.length > 0 ? (
          <SegmentedTabs
            aria-label="Timesheet periods"
            items={tabs}
            onValueChange={setPeriodId}
            value={selected?.id ?? ''}
          />
        ) : (
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 py-1">
            <Clock className="h-4 w-4" />
            <span>Time Tracker</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {timesheet.canWrite && (
            <Button
              onClick={() => setIsLogOpen(true)}
              size="sm"
              type="button"
              className="gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Log Time</span>
            </Button>
          )}

          {timesheet.canWrite && selected && selected.status === 'DRAFT' && (
            <Button
              disabled={timesheet.saving || selected.totalMinutes <= 0}
              onClick={() => void timesheet.submit(selected.id)}
              size="sm"
              type="button"
              variant="outline"
              title={selected.totalMinutes <= 0 ? 'Log time entries before submitting' : undefined}
            >
              {timesheet.saving ? 'Submitting...' : 'Submit'}
            </Button>
          )}

          {timesheet.canWrite && selected && selected.status === 'SUBMITTED' && (
            <>
              <Button
                disabled={timesheet.saving}
                onClick={() => void timesheet.unsubmit(selected.id)}
                size="sm"
                type="button"
                variant="ghost"
                className="text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50"
              >
                Recall to Draft
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800/60 font-medium">
                <span>Submitted</span>
              </div>
            </>
          )}

          {selected && selected.status === 'APPROVED' && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/60 font-medium">
              <span>✓ Approved</span>
            </div>
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
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="status"
        >
          <p className="text-sm font-semibold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view timesheets.
          </p>
        </div>
      )}

      {!timesheet.loading && timesheet.error && !timesheet.forbidden && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
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
            <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Briefcase className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">No time entries recorded yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Click <strong>Log Time</strong> above to log work against your assigned projects and
                jobs.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {groups.map((group) => (
                <div
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                  key={group.workDate}
                >
                  <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {group.workDate}
                    </span>
                    <span className="text-xs font-mono font-medium tabular-nums text-muted-foreground">
                      {group.totalLabel}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-border/50 last:border-0"
                      key={entry.id}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.projectName && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold bg-primary/5 text-primary border-primary/20"
                            >
                              {entry.projectName}
                            </Badge>
                          )}
                          {entry.jobName && (
                            <span className="text-[11px] font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border">
                              {entry.jobName}
                            </span>
                          )}
                          {entry.workItem && (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              #{entry.workItem}
                            </span>
                          )}
                          {entry.billable === false && (
                            <Badge variant="secondary" className="text-[9px]">
                              Non-Billable
                            </Badge>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-xs text-foreground line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {entry.startTime && entry.endTime && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {entry.startTime} - {entry.endTime}
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold tabular-nums text-foreground bg-muted/30 px-2 py-1 rounded">
                          {entry.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <LogTimeModal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        onSubmit={(input) => timesheet.addEntry(input, selected?.id)}
        projects={timesheet.projects}
        jobTypes={timesheet.jobTypes}
        // Each quick-add is offered only to someone the API will let use it: job types need
        // `timesheets.write`, projects the Projects module's `projects.write`.
        onCreateJobType={timesheet.canWrite ? timesheet.createJobType : undefined}
        onCreateProject={timesheet.canCreateProject ? timesheet.quickCreateProject : undefined}
        periodStart={
          selected?.period?.periodStart ? selected.period.periodStart.slice(0, 10) : undefined
        }
        periodEnd={selected?.period?.periodEnd ? selected.period.periodEnd.slice(0, 10) : undefined}
        saveError={timesheet.saveError}
        saving={timesheet.saving}
      />
    </PageShell>
  );
}
