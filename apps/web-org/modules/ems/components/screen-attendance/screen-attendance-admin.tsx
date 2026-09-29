'use client';

import React, { useMemo, useState } from 'react';
import { permittedTabs } from '../../lib/permitted-tabs';
import { formatDate, hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { Clock3 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Badge, Button, DatePicker, Input } from '@smarteam/ui';
import { currentMonthRange, useAttendanceAdmin } from '../../hooks/use-attendance-admin';
import { toAttendanceDayViews } from '../../services/attendance-view';
import { localDateKey } from '../../hooks/use-attendance';
import { AttendanceCorrectionsPanel } from './attendance-corrections-panel';
import { AttendancePolicyPanel } from './attendance-policy-panel';
import { WorkWeekPanel } from './work-week-panel';
import { PageShell } from '../layout/page-shell';
import { useMinuteClock } from '../../hooks/use-minute-clock';
import { useWorkWeek } from '../../hooks/use-work-week';
import { statusLabel } from '../../lib/status-label';

type Tab = 'records' | 'corrections' | 'policy';

/**
 * Organization-wide attendance.
 *
 * Replaces a screen driven entirely by `attendance-records.json`, keyed by a hardcoded demo
 * date. The range now defaults to the current month and every row is a record the API returned.
 */
export function ScreenAttendanceAdmin() {
  const defaults = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [requestedTab, setTab] = useScreenTab<Tab>(
    'attendanceTab',
    ['records', 'corrections', 'policy'],
    'records',
  );
  const { persona } = useSession();
  const permissions = persona?.permissions ?? [];
  const may = (permission: string) => hasPermission(permissions, permission);
  // Each tab is offered only to someone its API would answer.
  const { tabs, active } = permittedTabs<Tab, { id: Tab; label: string; allowed: boolean }>(
    [
      { id: 'records', label: 'Records', allowed: may('attendance.read.all') },
      { id: 'corrections', label: 'Regularization', allowed: may('attendance.corrections.decide') },
      {
        id: 'policy',
        label: 'Policy',
        allowed: may('attendance.preferences.read') || may('organizations.update'),
      },
    ],
    requestedTab,
  );
  const tab = active;
  const [search, setSearch] = useState('');

  const admin = useAttendanceAdmin(from, to);
  const todayKey = localDateKey();
  const now = useMinuteClock();
  const { workWeekDays } = useWorkWeek();

  const rows = useMemo(
    () =>
      toAttendanceDayViews(
        admin.records,
        todayKey,
        admin.corrections,
        new Map(),
        now,
        workWeekDays,
      ),
    [admin.records, admin.corrections, todayKey, now, workWeekDays],
  );

  const query = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      !query ||
      (row.employeeName ?? '').toLowerCase().includes(query) ||
      (row.employeeNumber ?? '').toLowerCase().includes(query),
  );

  return (
    <PageShell>
      <ScreenHeader icon={Clock3} title="Attendance" tone="success" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {tabs.map(({ id, label }) => (
            <Button
              className={`rounded-none pb-1 text-xs font-semibold ${
                tab === id
                  ? 'border-b-2 border-foreground font-bold text-foreground'
                  : 'text-muted-foreground'
              }`}
              key={id}
              onClick={() => setTab(id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {label}
            </Button>
          ))}
        </div>

        {/*
          The range is the primary control on this screen, so it is labelled rather than left as
          two bare fields: without a label a date on its own reads as printed data instead of
          something selectable.
        */}
        {tab === 'records' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">From</span>
              <DatePicker
                className="w-full min-w-0 sm:w-36"
                max={to || undefined}
                onChange={setFrom}
                placeholder="Start date"
                value={from}
              />
            </div>
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">To</span>
              <DatePicker
                className="w-full min-w-0 sm:w-36"
                min={from || undefined}
                onChange={setTo}
                placeholder="End date"
                value={to}
              />
            </div>
            <Input
              className="w-full min-w-0 sm:w-44"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search employee"
              placeholder="Search employee"
              value={search}
            />
          </div>
        )}
      </div>

      {tab === 'policy' && (
        <div className="space-y-3">
          <WorkWeekPanel />
          <AttendancePolicyPanel />
        </div>
      )}
      {tab === 'corrections' && <AttendanceCorrectionsPanel admin={admin} />}

      {tab === 'records' && (
        <>
          {admin.loading && (
            <p className="py-10 text-center text-xs text-muted-foreground" role="status">
              Loading attendance...
            </p>
          )}

          {!admin.loading && admin.forbidden && (
            <div
              className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
              role="status"
            >
              <p className="text-sm font-bold text-foreground">Not available</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You do not have permission to view attendance.
              </p>
            </div>
          )}

          {!admin.loading && admin.error && !admin.forbidden && (
            <div
              className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
              role="alert"
            >
              <p className="text-sm font-bold text-foreground">Could not load attendance</p>
              <p className="mt-1 text-xs text-muted-foreground">{admin.error}</p>
              <Button
                className="mt-3"
                onClick={() => void admin.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          )}

          {!admin.loading && !admin.error && filtered.length === 0 && (
            <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm font-bold text-foreground">No attendance records</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing was recorded in this range.
              </p>
            </div>
          )}

          {!admin.loading && !admin.error && filtered.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="stack-table stack-wide w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-border bg-table-header">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Employee</th>
                    <th className="px-4 py-2.5 font-bold">First in</th>
                    <th className="px-4 py-2.5 font-bold">Last out</th>
                    <th className="px-4 py-2.5 font-bold">Worked</th>
                    <th className="px-4 py-2.5 font-bold">Overtime</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                      key={row.id}
                    >
                      <td
                        data-bare=""
                        data-label="Date"
                        className="px-4 py-2.5 tabular-nums text-foreground"
                      >
                        {formatDate(row.workDate)}
                      </td>
                      <td data-cell="primary" className="px-4 py-2.5">
                        <span className="block font-semibold text-foreground">
                          {row.employeeName ?? 'Not in the directory'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {row.employeeNumber ?? '—'}
                        </span>
                      </td>
                      <td
                        data-label="First in"
                        className="px-4 py-2.5 tabular-nums text-muted-foreground"
                      >
                        {row.firstInTime ?? '—'}
                      </td>
                      <td
                        data-label="Last out"
                        className="px-4 py-2.5 tabular-nums text-muted-foreground"
                      >
                        {row.lastOutTime ?? '—'}
                      </td>
                      <td
                        data-label="Worked"
                        className="px-4 py-2.5 tabular-nums font-bold text-foreground"
                      >
                        {row.workedLabel}
                      </td>
                      <td
                        data-label="Overtime"
                        className="px-4 py-2.5 tabular-nums text-muted-foreground"
                      >
                        {row.overtimeLabel}
                      </td>
                      <td data-cell="status" data-label="Status" className="px-4 py-2.5">
                        <Badge variant="outline">{statusLabel(row.dayStatus)}</Badge>
                        {row.correctionStatus === 'PENDING' && (
                          <Badge className="ml-1" variant="secondary">
                            Correction pending
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
