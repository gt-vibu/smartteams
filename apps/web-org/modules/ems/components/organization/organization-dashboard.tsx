'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight, CalendarDays, ChevronDown, ChevronRight,
  Clock3, FileText, FolderKanban, MapPin, Settings2, UserPlus, Users, Wallet,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useApprovalInbox } from '../../hooks/use-approval-inbox';
import type { useOrganization } from '../../hooks/use-organization';
import type { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import type { useHolidays } from '../../hooks/use-holidays';
import { useAuth } from '../../hooks/use-auth';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { hasPermission } from '@smarteam/contracts';

type Headcount = {
  current: number;
  former?: number;
  managers?: number;
  months: Array<{ month: string; joined: number; left: number; active: number }>;
};
type Attendance = { totalEmployees: number; present: number; halfDays: number; absent: number; late: number };
type HolidayItem = { id: string; name: string; holidayDate: string; type?: string };

const day = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const monthName = (value: string) => new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Organization home: every metric is a server response; navigation tiles are permission filtered. */
export function OrganizationDashboard({
  onNavigateModule, organization, directory, holidays,
}: {
  onNavigateModule?: (module: string, view?: string) => void;
  organization: ReturnType<typeof useOrganization>;
  directory: ReturnType<typeof useEmployeeDirectory>;
  holidays: ReturnType<typeof useHolidays>;
}) {
  const { session, canAccessModule } = useSession();
  const { persona } = useAuth();
  const canReadAllEmployees = hasPermission(persona.permissions, 'employees.read.all');
  const approvals = useApprovalInbox();
  const [windowMonths, setWindowMonths] = useState(6);
  const [selectedGrowthMonth, setSelectedGrowthMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => day(new Date()));
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] = useState<string | null>(null);
  const orgId = session?.organizationId;
  const headcount = useAsyncResource<Headcount>(
    () => apiRequest(orgPath(orgId!, '/reports/headcount'), { method: 'GET' }) as Promise<Headcount>,
    [orgId], { enabled: Boolean(orgId) && canReadAllEmployees },
  );
  const selectedMonth = selectedDate.slice(0, 7);
  const attendance = useAsyncResource<Attendance>(
    () => apiRequest(orgPath(orgId!, `/reports/attendance-summary?date=${selectedDate}`), { method: 'GET' }) as Promise<Attendance>,
    [orgId, selectedDate], { enabled: Boolean(orgId) && hasPermission(persona.permissions, 'attendance.read.all') },
  );

  const branchCount = organization.loading || organization.error || organization.branchesForbidden
    ? undefined
    : organization.branches.filter((branch) => branch.status === 'ACTIVE').length;
  const series = (headcount.data?.months ?? []).slice(-windowMonths);
  const nextHolidays = (holidays.holidays ?? [])
    .filter((holiday) => holiday.holidayDate >= selectedDate)
    .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
    .slice(0, 3) as HolidayItem[];
  const attendanceTotals = useMemo(() => ({
    present: attendance.data?.present ?? 0,
    late: attendance.data?.late ?? 0,
    absent: attendance.data?.absent ?? 0,
    half: attendance.data?.halfDays ?? 0,
  }), [attendance.data]);
  const approvalCount = approvals.items.length;
  const quickActions = [
    ['onboarding', 'Add employee', 'Bring a new employee in', UserPlus],
    ['attendance', 'Mark attendance', 'Track daily attendance', Clock3],
    ['time-off', 'Create leave', 'Add a leave request', CalendarDays],
    ['payroll', 'Run payroll', 'Process this month', Wallet],
  ] as const;
  const modules = [
    ['onboarding', 'Onboarding', 'Bring a new employee in', UserPlus],
    ['time-off', 'Leave', 'Requests and balances', CalendarDays],
    ['attendance', 'Attendance', 'Track daily attendance', Clock3],
    ['timesheet', 'Timesheets', 'Submitted and approved', FileText],
    ['payroll', 'Payroll', 'Runs and salary structure', Wallet],
    ['teams', 'Teams', 'Departments and leads', Users],
    ['projects', 'Projects', 'Allocation and members', FolderKanban],
    ['holidays', 'Holidays', 'Organization calendar', CalendarDays],
  ] as const;

  const kpis = [
      { label: 'Employees', value: headcount.data?.current ?? directory.summary?.active, tone: 'blue', icon: Users, action: 'employees' },
    { label: 'Managers', value: headcount.data?.managers ?? (headcount.error || !canReadAllEmployees ? '—' : undefined), tone: 'orange', icon: Users, action: 'employees', view: 'managers' },
    { label: 'Branches', value: branchCount, tone: 'green', icon: MapPin, action: 'org-setup', view: 'branches' },
    { label: 'Former employees', value: headcount.data?.former ?? (headcount.error || !canReadAllEmployees ? '—' : directory.summary?.former), tone: 'rose', icon: Users, action: 'employees', view: 'former' },
  ];

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1500px] space-y-5 overflow-x-clip pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{greeting()}, Admin <span aria-hidden="true">☀️</span></h1>
          <p className="mt-1 text-muted-foreground">Here’s what’s happening at {organization.organization?.name ?? 'your organization'} today.</p>
        </div>
        <label className="relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium shadow-sm">
          <CalendarDays className="h-4 w-4" />{new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}<ChevronDown className="h-4 w-4" />
          <span className="sr-only">Choose dashboard month</span>
          <input type="month" aria-label="Choose dashboard month" value={selectedMonth} onChange={(event) => {
            const month = event.currentTarget.value;
            if (!month) return;
            const preferredDay = Number(selectedDate.slice(8, 10));
            const [year = new Date().getFullYear(), monthNumber = new Date().getMonth() + 1] = month.split('-').map(Number);
            const lastDay = new Date(year, monthNumber, 0).getDate();
            setSelectedDate(`${month}-${String(Math.min(preferredDay, lastDay)).padStart(2, '0')}`);
          }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 xl:col-span-7 xl:grid-cols-4">
          {kpis.map(({ label, value, tone, icon: Icon, action, view }, index) => (
            <button key={label} onClick={() => onNavigateModule?.(action, view)} className="group min-w-0 rounded-lg border border-border bg-card p-3 text-left shadow-2xs transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded-md ${tone === 'blue' ? 'bg-sky-100 text-sky-700' : tone === 'orange' ? 'bg-orange-100 text-orange-700' : tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}><Icon className="size-4" /></span><span className="truncate text-xs font-semibold text-foreground">{label}</span></span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2 flex items-end justify-between gap-1"><p className="text-xl font-bold leading-none tabular-nums">{value == null ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" /> : value.toLocaleString()}</p><p className="truncate text-[10px] text-muted-foreground">{index === 0 ? 'Current active employees' : index === 1 ? 'With active direct reports' : index === 2 ? 'Active office locations' : 'Former employee records'}</p></div>
            </button>
          ))}
        </div>
        <section className="relative flex min-h-[190px] overflow-hidden rounded-xl border border-border bg-[#103b2c] text-white shadow-sm xl:col-span-5">
          {organization.organization?.coverUrl ? <img src={organization.organization.coverUrl} alt="Organization banner" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_45%,#4a705c_0%,#173f30_45%,#0c2c21_100%)]" />}
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-black/10" />
          <div className="relative z-10 flex w-full flex-col justify-between p-5 sm:flex-row sm:items-end">
            <div className="flex items-end gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/30 bg-emerald-800 text-xl font-bold shadow-lg">
                {organization.organization?.logoUrl ? <img src={organization.organization.logoUrl} alt={`${organization.organization.name} logo`} className="h-full w-full object-cover" /> : (organization.organization?.name ?? 'S').slice(0, 2).toUpperCase()}
              </div>
              <div><h2 className="text-xl font-bold">{organization.organization?.name ?? 'Organization'}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-white/85"><MapPin className="h-3.5 w-3.5" />{organization.organization?.timezone ?? 'Timezone not set'} <span>·</span>{branchCount ?? '—'} branches <span>·</span>{organization.organization?.currencyCode}</p></div>
            </div>
            <Button variant="secondary" size="sm" className="mt-4 self-start bg-white text-slate-900 hover:bg-white/90 sm:mt-0" onClick={() => onNavigateModule?.('org-setup')}><Settings2 className="mr-2 h-4 w-4" />Edit organization</Button>
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-5">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2"><div><CardTitle>Employee growth</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selectedGrowthMonth ? `${monthName(selectedGrowthMonth)}: ${headcount.data?.months.find((item) => item.month === selectedGrowthMonth)?.active ?? 0} employees · ${headcount.data?.months.find((item) => item.month === selectedGrowthMonth)?.joined ?? 0} joined · ${headcount.data?.months.find((item) => item.month === selectedGrowthMonth)?.left ?? 0} left` : 'Total active employees over time'}</p></div><select aria-label="Growth period" value={windowMonths} onChange={(event) => { setWindowMonths(Number(event.target.value)); setSelectedGrowthMonth(null); }} className="h-9 rounded-lg border border-border bg-background px-2 text-xs"><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></CardHeader>
          <CardContent>
            {headcount.loading ? <div className="h-48 animate-pulse rounded-lg bg-muted" /> : headcount.error ? <p role="alert" className="py-12 text-center text-sm text-muted-foreground">Growth data is unavailable.</p> : <GrowthChart rows={series} selected={selectedGrowthMonth} onSelect={setSelectedGrowthMonth} />}
          </CardContent>
        </Card>
        <Card className="min-w-0 xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle>{selectedDate === day(new Date()) ? 'Today’s attendance' : `Attendance · ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}</CardTitle><button className="text-sm font-medium text-primary" onClick={() => onNavigateModule?.('attendance')}>View details <ChevronRight className="inline h-4 w-4" /></button></CardHeader>
          <CardContent className="flex min-h-[200px] items-center justify-between gap-4">
            {attendance.loading ? <div className="mx-auto h-36 w-36 animate-pulse rounded-full bg-muted" /> : attendance.error ? <p role="alert" className="py-12 text-center text-sm text-muted-foreground">Attendance summary is unavailable.</p> : <>
              <AttendanceRing values={[Math.max(0, attendanceTotals.present - attendanceTotals.late), attendanceTotals.late, attendanceTotals.absent, attendanceTotals.half]} active={attendance.data?.totalEmployees ?? null} selected={selectedAttendanceStatus} onSelect={setSelectedAttendanceStatus} />
              <div className="min-w-[125px] flex-1 space-y-2">{[['Present', Math.max(0, attendanceTotals.present - attendanceTotals.late), 'bg-emerald-600'], ['Late', attendanceTotals.late, 'bg-amber-500'], ['Absent', attendanceTotals.absent, 'bg-rose-500'], ['Half day', attendanceTotals.half, 'bg-sky-500']].map(([label, value, color]) => <button type="button" aria-pressed={selectedAttendanceStatus === label} key={String(label)} onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === label ? null : String(label))} className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"><span className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span><b className="tabular-nums">{Number(value).toLocaleString()}</b></button>)}</div>
            </>}
          </CardContent>
        </Card>
        <Card className="min-w-0 xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle>Upcoming holidays</CardTitle><button onClick={() => onNavigateModule?.('holidays')} className="text-sm font-medium text-primary">Calendar <ChevronRight className="inline h-4 w-4" /></button></CardHeader>
          <CardContent className="space-y-2">{holidays.loading ? <div className="h-36 animate-pulse rounded-lg bg-muted" /> : holidays.error ? <p role="alert" className="py-8 text-center text-sm text-muted-foreground">Holiday calendar is unavailable.</p> : nextHolidays.length ? nextHolidays.map((holiday) => <div key={holiday.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-rose-50 text-center text-rose-700"><span className="text-[10px] font-bold uppercase">{new Date(`${holiday.holidayDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span><b className="text-sm leading-4">{new Date(`${holiday.holidayDate}T12:00:00`).getDate()}</b></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{holiday.name}</p><p className="text-xs text-muted-foreground">{new Date(`${holiday.holidayDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p></div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No upcoming holidays.</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8"><CardHeader className="pb-3"><CardTitle>Quick actions</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-4">{quickActions.filter(([module]) => canAccessModule(module)).map(([module, title, detail, Icon]) => <button key={module} onClick={() => onNavigateModule?.(module)} className="group flex min-h-28 items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"><span><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-primary"><Icon className="h-5 w-5" /></span><b className="mt-2 block text-sm">{title}</b><small className="mt-0.5 block text-xs text-muted-foreground">{detail}</small></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" /></button>)}</CardContent></Card>
        <Card className="xl:col-span-4"><CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle>Pending approvals</CardTitle><button onClick={() => onNavigateModule?.('approvals')} className="text-sm font-medium text-primary">View all <ChevronRight className="inline h-4 w-4" /></button></CardHeader><CardContent>{approvals.loading ? <div className="h-28 animate-pulse rounded-lg bg-muted" /> : approvals.error ? <p className="py-5 text-sm text-muted-foreground">Approval summary is unavailable.</p> : approvalCount ? <button onClick={() => onNavigateModule?.('approvals')} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted/40"><span><b className="block text-sm">{approvalCount.toLocaleString()} requests</b><small className="text-muted-foreground">Waiting for review</small></span><ArrowRight className="h-4 w-4" /></button> : <p className="py-5 text-sm text-muted-foreground">No requests are waiting for review.</p>}</CardContent></Card>
      </div>

      <Card className="min-w-0"><CardHeader className="pb-3"><CardTitle>Go to module</CardTitle></CardHeader><CardContent className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">{modules.filter(([module]) => canAccessModule(module)).map(([module, title, detail, Icon]) => <button key={module} onClick={() => onNavigateModule?.(module)} aria-label={`Open ${title}`} className="group flex min-w-0 items-center gap-1.5 rounded-xl border border-border p-2.5 text-left transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-primary sm:size-10 sm:rounded-xl"><Icon className="size-4 sm:size-5" /></span><span className="min-w-0 flex-1"><b className="block break-words text-xs leading-4 sm:text-sm">{title}</b><small className="block line-clamp-2 break-words text-[10px] leading-4 text-muted-foreground sm:text-xs">{detail}</small></span><ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 sm:block" /></button>)}</CardContent></Card>
    </div>
  );
}

function GrowthChart({ rows, selected, onSelect }: { rows: Array<{ month: string; joined: number; left: number; active: number }>; selected: string | null; onSelect: (month: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.active));
  if (!rows.length) return <div className="grid h-48 place-items-center text-sm text-muted-foreground">No employee growth data available.</div>;
  return <div className="relative h-48 pt-3" role="img" aria-label="Employee joiners by month bar chart">
    <div className="absolute inset-x-0 top-3 bottom-7 flex flex-col justify-between">{[0, 1, 2, 3].map((n) => <div key={n} className="border-t border-dashed border-border" />)}</div>
    <div className="relative flex h-full items-end justify-around gap-2 px-3 pb-7">{rows.map((row) => <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={row.month}>
      <div className="pointer-events-none absolute bottom-[calc(100%-1.5rem)] z-10 hidden rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus-within:block">{monthName(row.month)} · {row.active} employees · {row.joined} joined</div>
      <button type="button" onClick={() => onSelect(row.month)} aria-pressed={selected === row.month} aria-label={`${monthName(row.month)} ${row.month.slice(0,4)}: ${row.active} active employees, ${row.joined} joined, ${row.left} left`} className={`w-full max-w-8 rounded-t-md transition hover:brightness-90 focus-visible:ring-2 focus-visible:ring-primary ${selected === row.month || (!selected && row === rows.at(-1)) ? 'bg-emerald-800' : 'bg-emerald-700/35'}`} style={{ height: `${Math.max(3, (row.active / max) * 74)}%` }} title={`${row.active} employees · ${row.joined} joined · ${row.left} left`} />
      <span className="absolute -bottom-6 text-[11px] text-muted-foreground">{monthName(row.month)}</span>
    </div>)}</div>
  </div>;
}

function AttendanceRing({ values, active, selected, onSelect }: { values: number[]; active: number | null; selected: string | null; onSelect: (status: string | null) => void }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const colors = ['#059669', '#f59e0b', '#ef4444', '#0ea5e9'];
  const labels = ['Present', 'Late', 'Absent', 'Half day'];
  let offset = 0;
  return <div className="relative h-36 w-36 shrink-0" aria-label={`${total} attendance records`}>
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--muted)" strokeWidth="13" />{total > 0 && values.map((value, index) => {
      const length = (value / total) * 301.6;
      const label = labels[index] ?? 'Attendance';
      const color = colors[index] ?? '#64748b';
      const segment = <circle key={label} cx="60" cy="60" r="48" fill="none" stroke={color} strokeWidth="13" strokeDasharray={`${length} ${301.6 - length}`} strokeDashoffset={-offset} className="cursor-pointer transition-opacity hover:opacity-75" role="button" tabIndex={0} aria-label={`${label}: ${value}`} aria-pressed={selected === label} onClick={() => onSelect(selected === label ? null : label)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(selected === label ? null : label); } }}><title>{label}: {value.toLocaleString()}</title></circle>;
      offset += length;
      return segment;
    })}</svg>
    <div className="absolute inset-0 grid place-content-center text-center"><b className="text-xl tabular-nums">{selected ? values[labels.indexOf(selected)]?.toLocaleString() ?? 0 : total.toLocaleString()}{selected || active == null ? '' : `/${active.toLocaleString()}`}</b><span className="text-[11px] text-muted-foreground">{selected ?? 'present today'}</span></div>
  </div>;
}
