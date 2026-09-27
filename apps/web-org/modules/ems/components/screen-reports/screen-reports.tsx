'use client';

import React, { useMemo, useState } from 'react';
import { SegmentedTabs } from '@smarteam/ui';
import { employmentTypeLabel, formatDateRange, hasPermission } from '@smarteam/contracts';
import { BarChart3 } from 'lucide-react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { localDateKey } from '../../lib/local-date';
import { ScreenHeader } from '../common/screen-header';
import { PageShell } from '../layout/page-shell';
import { Bars, ReportTable, Stat } from './report-parts';

type Report = 'headcount' | 'attendance' | 'leave' | 'project-hours';
type Span = 'this-month' | 'last-month' | 'quarter' | 'year';

const key = (date: Date) => date.toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2025-10" → "Oct 2025". */
const monthLabel = (value: string) => {
  const [year, month] = value.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
};
function spanDates(span: Span) {
  // The viewer's own month and day: at 00:30 in India on the 1st, UTC is still last month.
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = localDateKey(now);
  if (span === 'last-month')
    return { from: key(new Date(Date.UTC(y, m - 1, 1))), to: key(new Date(Date.UTC(y, m, 0))) };
  if (span === 'quarter') return { from: key(new Date(Date.UTC(y, m - 2, 1))), to: today };
  if (span === 'year') return { from: key(new Date(Date.UTC(y, 0, 1))), to: today };
  return { from: key(new Date(Date.UTC(y, m, 1))), to: today };
}

type Headcount = {
  current: number;
  attritionPercent: number;
  byDepartment: Array<{ label: string; value: number }>;
  byBranch: Array<{ label: string; value: number }>;
  byType: Array<{ label: string; value: number }>;
  months: Array<{ month: string; joined: number; left: number }>;
};
type AttendanceReport = {
  rows: Array<{
    employeeNumber: string;
    name: string;
    present: number;
    halfDays: number;
    absent: number;
    late: number;
    workedHours: number;
    overtimeHours: number;
  }>;
};
type LeaveReport = {
  totalDays: number;
  byType: Array<{ label: string; paid: boolean; days: number }>;
  byPerson: Array<{ employeeNumber: string; name: string; days: number }>;
};
type ProjectHours = {
  totalHours: number;
  billablePercent: number;
  rows: Array<{ project: string; billableHours: number; nonBillableHours: number }>;
};

/**
 * The organization in figures: headcount, attendance, leave and project hours. Each report reads
 * the records the rest of the product keeps, and exports exactly what is on screen.
 */
export function ScreenReports() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? null;
  const permissions = persona?.permissions ?? [];
  const available = useMemo(
    () =>
      (
        [
          ['headcount', 'Headcount', 'employees.read.all'],
          ['attendance', 'Attendance', 'attendance.read.all'],
          ['leave', 'Leave', 'leave.requests.read.all'],
          ['project-hours', 'Project hours', 'timesheets.read.all'],
        ] as const
      ).filter(([, , permission]) => hasPermission(permissions, permission)),
    [permissions],
  );
  const [report, setReport] = useState<Report>(available[0]?.[0] ?? 'headcount');
  const [span, setSpan] = useState<Span>('this-month');
  const { from, to } = spanDates(span);

  // Each answer carries the report it is for. Switching tabs renders once before the new request
  // starts, and the previous report's figures must never be read as the new one's.
  const data = useAsyncResource(
    async () => ({
      report,
      payload: await apiRequest(
        orgPath(
          organizationId!,
          `/reports/${report}${report === 'headcount' ? '' : `?from=${from}&to=${to}`}`,
        ),
        { method: 'GET' },
      ),
    }),
    [organizationId, report, from, to],
    { enabled: Boolean(organizationId) && available.length > 0 },
  );

  return (
    <PageShell>
      <ScreenHeader
        description="Headcount, attendance, leave and project hours — each exportable to a spreadsheet."
        icon={BarChart3}
        title="Reports"
        tone="primary"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs
          aria-label="Report"
          items={available.map(([id, label]) => ({ id, label }))}
          onValueChange={(value) => setReport(value as Report)}
          value={report}
        />
        {report !== 'headcount' && (
          <SegmentedTabs
            aria-label="Period"
            items={[
              { id: 'this-month', label: 'This month' },
              { id: 'last-month', label: 'Last month' },
              { id: 'quarter', label: '3 months' },
              { id: 'year', label: 'This year' },
            ]}
            onValueChange={(value) => setSpan(value as Span)}
            value={span}
          />
        )}
      </div>
      {report !== 'headcount' && (
        <p className="text-[11px] text-muted-foreground">{formatDateRange(from, to)}</p>
      )}

      {data.loading || (data.data && data.data.report !== report) ? (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Preparing the report…
        </p>
      ) : data.error ? (
        <p
          className="rounded-lg border border-border bg-card p-6 text-center text-xs text-destructive"
          role="alert"
        >
          {data.error}
        </p>
      ) : report === 'headcount' ? (
        <HeadcountView data={data.data?.payload as Headcount | null} />
      ) : report === 'attendance' ? (
        <AttendanceView data={data.data?.payload as AttendanceReport | null} from={from} />
      ) : report === 'leave' ? (
        <LeaveView data={data.data?.payload as LeaveReport | null} from={from} />
      ) : (
        <ProjectHoursView data={data.data?.payload as ProjectHours | null} from={from} />
      )}
    </PageShell>
  );
}

function HeadcountView({ data }: { data: Headcount | null }) {
  if (!data?.months) return null;
  const joined = data.months.reduce((sum, month) => sum + month.joined, 0);
  const left = data.months.reduce((sum, month) => sum + month.left, 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Employees" value={String(data.current)} />
        <Stat label="Joined" value={String(joined)} hint="last 12 months" />
        <Stat label="Left" value={String(left)} hint="last 12 months" />
        <Stat label="Attrition" value={`${data.attritionPercent}%`} hint="last 12 months" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Bars rows={data.byDepartment} title="By department" />
        <Bars rows={data.byBranch} title="By branch" />
        <Bars
          rows={data.byType.map((row) => ({ ...row, label: employmentTypeLabel(row.label) }))}
          title="By employment type"
        />
        <Bars
          rows={data.months.map((month) => ({
            label: monthLabel(month.month),
            value: month.joined,
            second: month.left,
          }))}
          split={['Joined', 'Left']}
          title="Joiners and leavers by month"
        />
      </div>
    </div>
  );
}

function AttendanceView({ data, from }: { data: AttendanceReport | null; from: string }) {
  if (!data?.rows) return null;
  const rows = data.rows;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Days present" value={String(rows.reduce((s, r) => s + r.present, 0))} />
        <Stat label="Days absent" value={String(rows.reduce((s, r) => s + r.absent, 0))} />
        <Stat label="Late check-ins" value={String(rows.reduce((s, r) => s + r.late, 0))} />
        <Stat
          label="Overtime"
          value={`${Math.round(rows.reduce((s, r) => s + r.overtimeHours, 0))} h`}
        />
      </div>
      <ReportTable
        columns={['Employee', 'Present', 'Half days', 'Absent', 'Late', 'Hours', 'Overtime']}
        fileName={`attendance-${from}.csv`}
        rows={rows.map((r) => [
          `${r.name} (${r.employeeNumber})`,
          r.present,
          r.halfDays,
          r.absent,
          r.late,
          r.workedHours,
          r.overtimeHours,
        ])}
        title="By person"
      />
    </div>
  );
}

function LeaveView({ data, from }: { data: LeaveReport | null; from: string }) {
  if (!data?.byType) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Days of leave" value={String(data.totalDays)} />
        <Stat label="People" value={String(data.byPerson.length)} />
        <Stat
          label="Unpaid"
          value={String(data.byType.filter((t) => !t.paid).reduce((s, t) => s + t.days, 0))}
          hint="days"
        />
      </div>
      <Bars
        rows={data.byType.map((type) => ({ label: type.label, value: type.days }))}
        title="By type"
        unit=" d"
      />
      <ReportTable
        columns={['Employee', 'Days']}
        fileName={`leave-${from}.csv`}
        rows={data.byPerson.map((p) => [`${p.name} (${p.employeeNumber})`, p.days])}
        title="By person"
      />
    </div>
  );
}

function ProjectHoursView({ data, from }: { data: ProjectHours | null; from: string }) {
  if (!data?.rows) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Hours logged" value={String(data.totalHours)} />
        <Stat label="Billable" value={`${data.billablePercent}%`} />
      </div>
      <Bars
        rows={data.rows.map((row) => ({
          label: row.project,
          value: row.billableHours,
          second: row.nonBillableHours,
        }))}
        split={['Billable', 'Non-billable']}
        title="Hours by project"
        unit=" h"
      />
      <ReportTable
        columns={['Project', 'Billable hours', 'Non-billable hours']}
        fileName={`project-hours-${from}.csv`}
        rows={data.rows.map((row) => [row.project, row.billableHours, row.nonBillableHours])}
        title="By project"
      />
    </div>
  );
}
