'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { LoadingIndicator, Button, DateRangePicker, Input, SegmentedTabs, Select } from '@smarteam/ui';
import { useLeaveAdmin } from '../../hooks/use-leave-admin';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { workforceRepository } from '../../repositories/workforce.repository';
import { CursorPageControls } from '../common/cursor-page-controls';
import { LeaveRequestQueue } from './leave-request-queue';
import { LeavePolicyPanel } from './leave-policy-panel';
import { LeaveBalancesPanel } from './leave-balances-panel';
import { PageShell } from '../layout/page-shell';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { permittedTabs } from '../../lib/permitted-tabs';
import { useDepartments } from '../../hooks/use-departments';
import { EmployeeCombobox } from '../common/employee-combobox';
import { reportExportRepository } from '../../repositories/report-export.repository';

type Tab = 'requests' | 'balances' | 'types';

function endOfMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

/**
 * Organization-wide leave.
 *
 * Replaces a 1,055-line screen driven by `leave.json` and `leave-policies.json`, split here into
 * a queue, a balances table and a policy panel so each stays readable on its own.
 */
export function ScreenLeaveAdmin() {
  const [requestedTab, setTab] = useScreenTab<Tab>(
    'leaveTab',
    ['requests', 'balances', 'types'],
    'requests',
  );
  const { persona, session } = useSession();
  const permissions = persona?.permissions ?? [];
  const may = (permission: string) => hasPermission(permissions, permission);
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const departments = useDepartments();
  const settledSearch = useDebouncedValue(search.trim());

  // Each tab is offered only to someone its API would answer.
  const { tabs, active } = permittedTabs<Tab, { id: Tab; label: string; allowed: boolean }>(
    [
      {
        id: 'requests',
        label: 'Requests',
        allowed: may('leave.requests.read.all'),
      },
      { id: 'balances', label: 'Balances', allowed: may('leave.balances.read.all') },
      { id: 'types', label: 'Leave types', allowed: may('leave.types.read') },
    ],
    requestedTab,
  );
  const tab = active;
  const admin = useLeaveAdmin(status, tab ?? 'requests', settledSearch, { employeeId, departmentId, from, to });
  const exportLeave = async () => {
    if (!session?.organizationId || !from || !to || exporting) return;
    setExporting(true); setExportError('');
    try { await reportExportRepository.leave(session.organizationId, { from, to, status: status === 'ALL' ? undefined : status, employeeId: employeeId || undefined, departmentId: departmentId || undefined, search: settledSearch || undefined }); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Could not export leave requests.'); }
    finally { setExporting(false); }
  };
  const branches = useAsyncResource(
    () => workforceRepository.listBranches(session!.organizationId),
    [session?.organizationId],
    { enabled: Boolean(session?.organizationId) && tab === 'types' && may('branches.read') },
  );

  const statusTabs = [
    { id: 'PENDING', label: 'Pending', tone: 'var(--warning, oklch(0.75 0.15 75))' },
    { id: 'APPROVED', label: 'Approved', tone: 'var(--success)' },
    { id: 'REJECTED', label: 'Rejected', tone: 'var(--destructive)' },
    { id: 'CANCELLED', label: 'Cancelled', tone: 'var(--muted-foreground)' },
    { id: 'ALL', label: 'All' },
  ];

  return (
    <PageShell>
      <ScreenHeader icon={CalendarDays} title="Leave" tone="accent" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <SegmentedTabs
          aria-label="Leave administration sections"
          items={tabs}
          onValueChange={(value) => setTab(value as Tab)}
          value={tab ?? ''}
        />
        <span className="pb-2 text-[11px] text-muted-foreground">
          {admin.inbox.length} awaiting your decision
        </span>
      </div>

      {tab === 'requests' && (
        <>
          {admin.summary && (
            <section aria-label="Leave request summary" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <button className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const active = status === 'PENDING' && !from && !to; setStatus(active ? 'ALL' : 'PENDING'); setFrom(''); setTo(''); }} type="button" aria-pressed={status === 'PENDING' && !from && !to}>
                <span className="text-[11px] text-muted-foreground">Pending requests</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{admin.summary.pending}</span><span className="text-[10px] text-muted-foreground">Awaiting a decision</span>
              </button>
              <button className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const start = `${admin.summary!.month}-01`; const end = endOfMonth(admin.summary!.month); const active = status === 'APPROVED' && from === start && to === end; setStatus(active ? 'ALL' : 'APPROVED'); setFrom(active ? '' : start); setTo(active ? '' : end); }} type="button" aria-pressed={status === 'APPROVED' && from === `${admin.summary.month}-01` && to === endOfMonth(admin.summary.month)}>
                <span className="text-[11px] text-muted-foreground">Approved this month</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{admin.summary.approvedThisMonth}</span><span className="text-[10px] text-muted-foreground">Approved requests touching {admin.summary.month}</span>
              </button>
              <button className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const date = admin.summary!.asOf; const active = status === 'APPROVED' && from === date && to === date; setStatus(active ? 'ALL' : 'APPROVED'); setFrom(active ? '' : date); setTo(active ? '' : date); }} type="button" aria-pressed={status === 'APPROVED' && from === admin.summary.asOf && to === admin.summary.asOf}>
                <span className="text-[11px] text-muted-foreground">On leave today</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{admin.summary.employeesOnLeaveToday}</span><span className="text-[10px] text-muted-foreground">Employees · {admin.summary.asOf}</span>
              </button>
              <button className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const start = `${admin.summary!.month}-01`; const end = endOfMonth(admin.summary!.month); const active = status === 'APPROVED' && from === start && to === end; setStatus(active ? 'ALL' : 'APPROVED'); setFrom(active ? '' : start); setTo(active ? '' : end); }} type="button" aria-pressed={status === 'APPROVED' && from === `${admin.summary.month}-01` && to === endOfMonth(admin.summary.month)}>
                <span className="text-[11px] text-muted-foreground">Days in approved requests</span><span className="mt-0.5 block text-xl font-semibold tabular-nums">{admin.summary.approvedDaysTouchingMonth}</span><span className="text-[10px] text-muted-foreground">Requests touching {admin.summary.month}</span>
              </button>
            </section>
          )}
          {admin.refreshing && <p className="text-[11px] text-muted-foreground" role="status">Updating requests…</p>}
          <SegmentedTabs
            aria-label="Filter requests by status"
            items={statusTabs}
            onValueChange={setStatus}
            value={status}
          />
          <Input
            aria-label="Search leave requests"
            placeholder="Search employee name or ID"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <DateRangePicker aria-label="Filter leave by date range" className="w-full" from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end || start); }} />
            <Select aria-label="Filter leave by department" onChange={(event) => setDepartmentId(event.target.value)} value={departmentId}><option value="">All departments</option>{departments.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select>
            <EmployeeCombobox employees={[]} value={employeeId} onChange={setEmployeeId} noneLabel="All employees" placeholder="Filter by employee" />
            <Button disabled={!from || !to || exporting || !may('leave.requests.read.all')} onClick={() => void exportLeave()} type="button" variant="outline">{exporting ? 'Preparing export…' : 'Export filtered CSV'}</Button>
          </div>
          {exportError && <p className="text-xs text-destructive" role="alert">{exportError}</p>}
        </>
      )}

      {tab === 'balances' && <Input aria-label="Search leave balances" placeholder="Search employee name or ID" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} />}

      {admin.loading && (
        <LoadingIndicator variant="panel" label="Loading leave" className="py-10 text-center text-xs text-muted-foreground" />
      )}

      {!admin.loading && admin.forbidden && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="status"
        >
          <p className="text-sm font-semibold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view leave.
          </p>
        </div>
      )}

      {!admin.loading && admin.error && !admin.forbidden && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-foreground">Could not load leave</p>
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

      {!admin.loading && !admin.error && (
        <>
          {tab === 'requests' && (
            <>
              <LeaveRequestQueue admin={admin} requests={admin.requests} />
              <CursorPageControls
                page={admin.paging.page}
                count={admin.requests.length}
                nextCursor={admin.nextCursor}
                busy={admin.refreshing || search.trim() !== settledSearch}
                previous={admin.paging.previous}
                next={admin.paging.next}
              />
            </>
          )}

          {tab === 'balances' && <>
            <LeaveBalancesPanel admin={admin} />
            <CursorPageControls page={admin.paging.page} count={admin.balances.length} nextCursor={admin.nextCursor} busy={admin.refreshing || search.trim() !== settledSearch} previous={admin.paging.previous} next={admin.paging.next} />
          </>}

          {tab === 'types' && (
            <>
              {branches.error && (
                <p role="alert" className="text-xs text-destructive">
                  Could not load branches. {branches.error}{' '}
                  <Button size="sm" variant="outline" onClick={() => void branches.refetch()}>
                    Try again
                  </Button>
                </p>
              )}
              <LeavePolicyPanel admin={admin} branches={branches.data ?? []} />
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
