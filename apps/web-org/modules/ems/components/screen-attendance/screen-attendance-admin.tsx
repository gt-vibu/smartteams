'use client';

import React, { useMemo, useRef, useState } from 'react';
import { permittedTabs } from '../../lib/permitted-tabs';
import { formatDate, hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { Clock3 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { LoadingIndicator, Badge, Button, DateRangePicker, Input, Select } from '@smarteam/ui';
import { Download } from 'lucide-react';
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
import { CursorPageControls } from '../common/cursor-page-controls';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useDepartments } from '../../hooks/use-departments';
import { attendanceRepository } from '../../repositories/attendance.repository';
import { downloadFile, toCsv } from '../../lib/csv';
import { downloadReportPdf } from '../../lib/report-pdf';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { useAsyncResource } from '../../hooks/use-async-resource';

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
  const [selectedSummaryStatus, setSelectedSummaryStatus] = useState<string | null>(null);
  const summaryRangeBeforeFilter = useRef<{ from: string; to: string } | null>(null);
  const [requestedTab, setTab] = useScreenTab<Tab>(
    'attendanceTab',
    ['records', 'corrections', 'policy'],
    'records',
  );
  const { persona, session } = useSession();
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
        allowed:
          may('attendance.preferences.read') ||
          may('attendance.preferences.write') ||
          may('organizations.update'),
      },
    ],
    requestedTab,
  );
  const tab = active;
  const [search, setSearch] = useState('');

  const [correctionStatus, setCorrectionStatus] = useState('ALL');
  const [departmentId, setDepartmentId] = useState('');
  const [dayStatus, setDayStatus] = useState('ALL');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const departments = useDepartments();
  const settledSearch = useDebouncedValue(search.trim());
  const admin = useAttendanceAdmin(
    from,
    to,
    settledSearch,
    tab ?? 'records',
    correctionStatus,
    departmentId,
    dayStatus,
  );
  const todayKey = localDateKey();
  const todaySummary = useAsyncResource<{
    totalEmployees: number;
    present: number;
    late: number;
    absent: number;
    halfDays: number;
  }>(
    () =>
      apiRequest(orgPath(session!.organizationId, `/reports/attendance-summary?date=${todayKey}`), {
        method: 'GET',
      }) as Promise<{
        totalEmployees: number;
        present: number;
        late: number;
        absent: number;
        halfDays: number;
      }>,
    [session?.organizationId, todayKey],
    {
      enabled: Boolean(session?.organizationId) && tab === 'records' && may('attendance.read.all'),
    },
  );
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

  const filtered = rows;
  const exportRows = async () => {
    if (!session?.organizationId || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const records = [] as typeof admin.records;
      let cursor: string | undefined;
      do {
        const page = await attendanceRepository.list(session.organizationId, {
          from,
          to,
          search: settledSearch || undefined,
          departmentId: departmentId || undefined,
          dayStatus: dayStatus === 'ALL' ? undefined : dayStatus,
          cursor,
          limit: 500,
        });
        records.push(...page.records);
        cursor = page.nextCursor;
      } while (cursor);
      const allRows = toAttendanceDayViews(records, todayKey, [], new Map(), now, workWeekDays);
      return allRows.map((row) => [
        formatDate(row.workDate),
        row.employeeName ?? 'Not in the directory',
        row.employeeNumber ?? '',
        row.firstInTime ?? '',
        row.lastOutTime ?? '',
        row.workedLabel,
        row.overtimeLabel,
        statusLabel(row.dayStatus),
      ]);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not prepare this export.');
      return null;
    } finally {
      setExporting(false);
    }
  };
  const exportCsv = async () => {
    const result = await exportRows();
    if (result)
      downloadFile(
        `attendance-${from}-to-${to}.csv`,
        toCsv([
          [
            'Date',
            'Employee',
            'Employee ID',
            'First in',
            'Last out',
            'Worked',
            'Overtime',
            'Status',
          ],
          ...result,
        ]),
      );
  };
  const exportPdf = async () => {
    const result = await exportRows();
    if (!result) return;
    if (result.length > 5000) {
      setExportError(
        'This range contains more than 5,000 rows. Export CSV for the complete result, or narrow the date range for PDF.',
      );
      return;
    }
    await downloadReportPdf(
      'Attendance report',
      ['Date', 'Employee', 'Employee ID', 'First in', 'Last out', 'Worked', 'Overtime', 'Status'],
      result,
    );
  };

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
            <DateRangePicker
              aria-label="Attendance date range"
              className="w-full sm:w-64"
              from={from}
              to={to}
              onChange={(start, end) => {
                summaryRangeBeforeFilter.current = null;
                setSelectedSummaryStatus(null);
                setDayStatus('ALL');
                setFrom(start);
                setTo(end || start);
              }}
            />
            <Input
              className="w-full min-w-0 sm:w-44"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search employee"
              maxLength={100}
              placeholder="Search employee"
              value={search}
            />
            <Select
              aria-label="Filter by department"
              className="w-full sm:w-48"
              onChange={(event) => setDepartmentId(event.target.value)}
              value={departmentId}
            >
              <option value="">All departments</option>
              {departments.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by attendance status"
              className="w-full sm:w-44"
              onChange={(event) => {
                if (selectedSummaryStatus && summaryRangeBeforeFilter.current) {
                  setFrom(summaryRangeBeforeFilter.current.from);
                  setTo(summaryRangeBeforeFilter.current.to);
                }
                summaryRangeBeforeFilter.current = null;
                setSelectedSummaryStatus(null);
                setDayStatus(event.target.value);
              }}
              value={dayStatus}
            >
              <option value="ALL">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LATE">Late</option>
              <option value="HALF_DAY">Half day</option>
              <option value="ON_LEAVE">On leave</option>
            </Select>
            <Button
              className="gap-1.5"
              disabled={exporting}
              onClick={() => void exportCsv()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? 'Preparing…' : 'CSV'}
            </Button>
            <Button
              className="gap-1.5"
              disabled={exporting}
              onClick={() => void exportPdf()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
            {admin.refreshing && (
              <span className="text-[11px] text-muted-foreground" role="status">
                Updating results…
              </span>
            )}
          </div>
        )}
      </div>
      {tab === 'records' && (
        <div
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
          aria-label="Today’s attendance summary"
        >
          {[
            {
              label: 'Present today',
              value: Math.max(
                0,
                (todaySummary.data?.present ?? 0) - (todaySummary.data?.late ?? 0),
              ),
              status: 'PRESENT',
              tone: 'text-emerald-700 bg-emerald-100',
            },
            {
              label: 'Late arrivals',
              value: todaySummary.data?.late ?? 0,
              status: 'LATE',
              tone: 'text-amber-700 bg-amber-100',
            },
            {
              label: 'Absent',
              value: todaySummary.data?.absent ?? 0,
              status: 'ABSENT',
              tone: 'text-rose-700 bg-rose-100',
            },
            {
              label: 'Half day',
              value: todaySummary.data?.halfDays ?? 0,
              status: 'HALF_DAY',
              tone: 'text-sky-700 bg-sky-100',
            },
          ].map(({ label, value, status, tone }) => {
            const selected = selectedSummaryStatus === status;
            return (
              <button
                aria-pressed={selected}
                className={`flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary/50 ring-1 ring-primary/25' : 'border-border'}`}
                key={label}
                onClick={() => {
                  if (selected) {
                    const previousRange = summaryRangeBeforeFilter.current ?? defaults;
                    setFrom(previousRange.from);
                    setTo(previousRange.to);
                    setDayStatus('ALL');
                    setSelectedSummaryStatus(null);
                    summaryRangeBeforeFilter.current = null;
                    return;
                  }
                  if (selectedSummaryStatus === null) {
                    summaryRangeBeforeFilter.current = { from, to };
                  }
                  setSelectedSummaryStatus(status);
                  setFrom(todayKey);
                  setTo(todayKey);
                  setDayStatus(status);
                }}
                type="button"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                  <Clock3 className="size-4" />
                </span>
                <span className="min-w-0">
                  <b className="block tabular-nums text-lg leading-tight">
                    {todaySummary.loading ? '—' : todaySummary.error ? '—' : value.toLocaleString()}
                  </b>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {exportError && (
        <p role="alert" className="text-xs text-destructive">
          {exportError}
        </p>
      )}

      {tab === 'policy' && (
        <div className="space-y-3">
          <WorkWeekPanel />
          <AttendancePolicyPanel />
        </div>
      )}
      {tab === 'corrections' && (
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Search correction requests"
            maxLength={100}
            placeholder="Search employee name or ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Correction status"
            className="rounded-md border border-input bg-background p-2 text-xs"
            value={correctionStatus}
            onChange={(event) => setCorrectionStatus(event.target.value)}
          >
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === 'corrections' && (
        <>
          {admin.error && (
            <p role="alert" className="text-xs text-destructive">
              {admin.error}{' '}
              <Button size="sm" variant="outline" onClick={() => void admin.refetch()}>
                Try again
              </Button>
            </p>
          )}
          {admin.loading && (
            <LoadingIndicator variant="inline" label="Loading corrections" className="text-xs" />
          )}
          <AttendanceCorrectionsPanel admin={admin} />
          <CursorPageControls
            page={admin.paging.page}
            count={admin.corrections.length}
            nextCursor={admin.nextCursor}
            busy={admin.refreshing || search.trim() !== settledSearch}
            previous={admin.paging.previous}
            next={admin.paging.next}
          />
        </>
      )}

      {tab === 'records' && (
        <>
          {admin.loading && (
            <LoadingIndicator
              variant="panel"
              label="Loading attendance"
              className="py-10 text-center text-xs text-muted-foreground"
            />
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
                {search
                  ? 'No employees match this search in the selected date range. Clear the search or change the dates.'
                  : 'Nothing was recorded in this range. Try a different date range.'}
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
          {!admin.error && (
            <CursorPageControls
              page={admin.paging.page}
              count={admin.records.length}
              nextCursor={admin.nextCursor}
              busy={admin.loading || admin.refreshing || search.trim() !== settledSearch}
              previous={admin.paging.previous}
              next={admin.paging.next}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
