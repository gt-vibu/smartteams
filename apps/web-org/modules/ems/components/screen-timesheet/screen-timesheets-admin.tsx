'use client';

import type { ColumnDef } from '@smarteam/ui';
import {
  LoadingIndicator,
  Button,
  DateRangePicker,
  Input,
  Select,
  StandardDataTable,
} from '@smarteam/ui';
import { useMemo, useState } from 'react';
import { useTimesheetAdmin } from '../../hooks/use-timesheet-admin';
import { DecisionReasonDialog } from '../common/decision-reason-dialog';
import { PageShell } from '../layout/page-shell';
import { OpenPeriodDialog } from './open-period-dialog';
import { StatusPill, TimesheetAuditDrawer } from './timesheet-audit-drawer';
import { toAuditRows, type TimesheetAuditRow } from './timesheet-audit-row';
import { useDepartments } from '../../hooks/use-departments';
import { EmployeeCombobox } from '../common/employee-combobox';
import { reportExportRepository } from '../../repositories/report-export.repository';
import { useSession } from '../../hooks/auth-context';
import { CursorPageControls } from '../common/cursor-page-controls';
import {
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ClipboardList } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

/**
 * Timesheet operations: the approval queue for an organization.
 *
 * This screen used to render a hardcoded list of invented employees held in `useState`, while
 * `useTimesheetAdmin` — a complete hook wired to the real API — sat unused beside it. Approving a
 * row edited the local array and told the approver it had worked. Every figure here now comes
 * from the API, and every decision goes back to it.
 *
 * Permission is the API's to enforce, not this screen's: `timesheets.read` returns only the
 * caller's own sheets, and the queue says so rather than looking mysteriously empty.
 */
export function ScreenTimesheetsAdmin() {
  const { session } = useSession();
  const [openingPeriod, setOpeningPeriod] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const initialMonth = new Date();
  const [from, setFrom] = useState(monthStart(initialMonth));
  const [to, setTo] = useState(monthEnd(initialMonth));
  const [month, setMonth] = useState(
    new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );
  const [showFilters, setShowFilters] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const settledEmployeeSearch = useDebouncedValue(employeeSearch.trim());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const departments = useDepartments();
  const admin = useTimesheetAdmin({
    status: selectedStatus,
    departmentId,
    employeeId,
    from,
    to,
    search: settledEmployeeSearch,
  });
  const [activeRow, setActiveRow] = useState<TimesheetAuditRow | null>(null);

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setFrom(monthStart(next));
    setTo(monthEnd(next));
  };

  const rows = useMemo(
    () => toAuditRows(admin.timesheets, admin.employees),
    [admin.employees, admin.timesheets],
  );
  const filtered = rows;
  const resultCount =
    selectedStatus === 'ALL'
      ? (admin.summary?.totalCount ?? admin.timesheets.length)
      : (admin.summary?.statusCounts[selectedStatus]?.count ?? 0);
  const exportTimesheets = async () => {
    if (!session?.organizationId || !from || !to || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      await reportExportRepository.timesheets(session.organizationId, {
        from,
        to,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        departmentId: departmentId || undefined,
        employeeId: employeeId || undefined,
        search: employeeSearch.trim() || undefined,
      });
      window.dispatchEvent(
        new CustomEvent('ems:feedback', {
          detail: { tone: 'success', message: 'Timesheet export downloaded.' },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not export timesheets.';
      setExportError(message);
      window.dispatchEvent(new CustomEvent('ems:feedback', { detail: { tone: 'error', message } }));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnDef<TimesheetAuditRow>[] = [
    {
      id: 'employeeName',
      header: 'Employee',
      accessorKey: 'employeeName',
      sortable: true,
      pinned: 'left',
      cell: (row) => (
        <div>
          <div className="font-bold text-foreground transition-colors group-hover:text-sky-700">
            {row.employeeName}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">{row.employeeNumber}</div>
        </div>
      ),
    },
    {
      id: 'period',
      header: 'Period',
      accessorKey: 'period',
      sortable: true,
      cell: (row) => <span className="font-medium text-foreground">{row.period}</span>,
    },
    {
      id: 'totalHours',
      header: 'Total logged',
      accessorKey: 'totalHours',
      sortable: true,
      cell: (row) => (
        <span className="font-mono font-bold tabular-nums text-foreground">
          {row.totalHours} hrs
        </span>
      ),
    },
    {
      id: 'overtimeHours',
      header: 'Overtime',
      accessorKey: 'overtimeHours',
      sortable: true,
      cell: (row) => (
        <span className="font-mono tabular-nums font-medium text-amber-600 dark:text-amber-500">
          {row.overtimeHours} hrs
        </span>
      ),
    },
    {
      id: 'entryCount',
      header: 'Entries',
      accessorKey: 'entryCount',
      sortable: true,
      cell: (row) => (
        <span className="font-mono tabular-nums text-muted-foreground">{row.entryCount}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (row) => <StatusPill status={row.status} />,
    },
  ];

  return (
    <div className="w-full">
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 bg-background">
        <div className="border-b border-border/90 bg-card/95 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <ScreenHeader
            actions={
              admin.canManagePeriods && (
                <Button
                  className="shrink-0"
                  onClick={() => setOpeningPeriod(true)}
                  size="sm"
                  type="button"
                >
                  Create timesheets
                </Button>
              )
            }
            icon={ClipboardList}
            description="Review employee work logs and manage reporting periods."
            title="Timesheets"
            tone="primary"
          />
        </div>
      </div>

      <DecisionReasonDialog
        busy={admin.saving}
        confirmLabel="Reject timesheet"
        destructive
        error={admin.saveError}
        isOpen={pendingDecision === 'REJECTED' && activeRow !== null}
        onClose={() => setPendingDecision(null)}
        onConfirm={async (reason) => {
          if (!activeRow) return;
          const ok = await admin.decide(activeRow.id, 'REJECTED', reason);
          if (ok !== false) {
            setPendingDecision(null);
            setActiveRow(null);
          }
        }}
        title="Reject this timesheet"
      />

      <OpenPeriodDialog
        isOpen={openingPeriod}
        onClose={() => setOpeningPeriod(false)}
        onOpen={admin.openPeriod}
        saveError={admin.saveError}
        saving={admin.saving}
      />

      <PageShell>
        {!admin.canReadAll && !admin.loading && !admin.forbidden && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            You can see your own timesheets only. Reading the whole organization&apos;s queue needs
            the <code className="font-mono">timesheets.read.all</code> permission.
          </p>
        )}
        <section
          aria-label="Timesheet filters"
          className="space-y-3 border-b border-border/80 bg-background px-4 py-4 sm:px-6"
        >
          <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.5rem] items-center gap-2 sm:flex sm:flex-wrap">
            <Button
              aria-label="Previous month"
              className="size-9 shrink-0 px-0"
              onClick={() => shiftMonth(-1)}
              type="button"
              variant="outline"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <DateRangePicker
              aria-label="Choose timesheet date range"
              className="h-10 min-w-0 w-full sm:w-[270px]"
              from={from}
              to={to}
              onChange={(start, end) => {
                if (!start) return;
                setFrom(start);
                setTo(end || start);
                setMonth(new Date(`${start}T00:00:00`));
              }}
            />
            <Button
              aria-label="Next month"
              className="size-9 shrink-0 px-0"
              onClick={() => shiftMonth(1)}
              type="button"
              variant="outline"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              aria-expanded={showFilters}
              aria-label="Show timesheet filters"
              className="size-10 shrink-0 px-0"
              onClick={() => setShowFilters((value) => !value)}
              type="button"
              variant={showFilters ? 'default' : 'outline'}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
            <Input
              aria-label="Search timesheet employees"
              className="col-span-4 h-10 w-full sm:col-span-1 sm:max-w-[280px]"
              maxLength={100}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="Search employees…"
              value={employeeSearch}
            />
            {admin.canReadAll && (
              <div className="col-span-4 flex justify-end sm:col-span-1 sm:justify-start">
                <Button
                  className="min-w-24 shrink-0"
                  disabled={!from || !to || exporting}
                  onClick={() => void exportTimesheets()}
                  type="button"
                  variant="outline"
                >
                  {exporting ? 'Preparing…' : 'Export'}
                </Button>
              </div>
            )}
          </div>
          {showFilters && (
            <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                aria-label="Filter timesheets by department"
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
              <EmployeeCombobox
                employees={[]}
                value={employeeId}
                onChange={setEmployeeId}
                noneLabel="All employees"
                placeholder="Filter by employee"
              />
            </div>
          )}
        </section>
        {admin.saveError && (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
            role="alert"
          >
            {admin.saveError}
          </p>
        )}
        {exportError && (
          <p role="alert" className="text-xs text-destructive">
            {exportError}
          </p>
        )}

        {admin.refreshing && (
          <p className="text-[11px] text-muted-foreground" role="status">
            Updating timesheets…
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            active={selectedStatus === 'SUBMITTED'}
            detail="Timesheets to review"
            icon={Clock3}
            label="Needs review"
            loading={admin.loading && !admin.summary}
            onClick={() => setSelectedStatus(selectedStatus === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
            tone="amber"
            value={admin.summary?.statusCounts.SUBMITTED?.count ?? 0}
          />
          <Kpi
            active={selectedStatus === 'APPROVED'}
            detail="Completed approvals"
            icon={CheckCircle2}
            label="Approved"
            loading={admin.loading && !admin.summary}
            onClick={() => setSelectedStatus(selectedStatus === 'APPROVED' ? 'ALL' : 'APPROVED')}
            tone="green"
            value={admin.summary?.statusCounts.APPROVED?.count ?? 0}
          />
          <Kpi
            active={selectedStatus === 'DRAFT'}
            detail="Timesheets in progress"
            icon={FileText}
            label="Drafts"
            loading={admin.loading && !admin.summary}
            onClick={() => setSelectedStatus(selectedStatus === 'DRAFT' ? 'ALL' : 'DRAFT')}
            tone="neutral"
            value={admin.summary?.statusCounts.DRAFT?.count ?? 0}
          />
          <Kpi
            active={selectedStatus === 'ALL'}
            detail="Total hours in this period"
            icon={ChartNoAxesColumnIncreasing}
            label="Logged hours"
            loading={admin.loading && !admin.summary}
            onClick={() => setSelectedStatus('ALL')}
            suffix=" h"
            tone="blue"
            value={Math.round(((admin.summary?.totalMinutes ?? 0) / 60) * 10) / 10}
          />
        </div>

        <nav
          aria-label="Filter timesheets by status"
          className="flex gap-1 overflow-x-auto border-b border-border"
          role="tablist"
        >
          {[
            { value: 'ALL', label: 'All', count: admin.summary?.totalCount },
            {
              value: 'SUBMITTED',
              label: 'Needs review',
              count: admin.summary?.statusCounts.SUBMITTED?.count ?? 0,
            },
            {
              value: 'APPROVED',
              label: 'Approved',
              count: admin.summary?.statusCounts.APPROVED?.count ?? 0,
            },
            {
              value: 'DRAFT',
              label: 'Drafts',
              count: admin.summary?.statusCounts.DRAFT?.count ?? 0,
            },
            {
              value: 'REJECTED',
              label: 'Rejected',
              count: admin.summary?.statusCounts.REJECTED?.count ?? 0,
            },
          ].map((tab) => (
            <button
              aria-selected={selectedStatus === tab.value}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${selectedStatus === tab.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label} <span className="ml-1 text-muted-foreground">{tab.count ?? '—'}</span>
            </button>
          ))}
        </nav>

        {admin.forbidden ? (
          <Notice detail="You do not have permission to read timesheets." title="Not available" />
        ) : admin.loading ? (
          <LoadingIndicator
            variant="panel"
            label="Loading timesheets"
            className="py-10 text-center text-xs text-muted-foreground"
          />
        ) : admin.error ? (
          <Notice detail={admin.error} role="alert" title="Could not load timesheets" />
        ) : rows.length === 0 ? (
          <Notice
            detail="No timesheets have been submitted yet. Deriving a period creates them from recorded attendance."
            title="Nothing to review"
          />
        ) : (
          <StandardDataTable
            columns={columns}
            data={filtered}
            initialRowsPerPage={100}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => setActiveRow(row)}
            pagination={false}
            searchable={false}
            showColumnVisibilityToggle={false}
            compact
          />
        )}

        {activeRow && (
          <TimesheetAuditDrawer
            busy={admin.saving}
            canDecide={admin.canDecide}
            onClose={() => setActiveRow(null)}
            onDecide={async (status) => {
              if (status === 'APPROVED') {
                const ok = await admin.decide(activeRow.id, 'APPROVED', '');
                if (ok !== false) {
                  setActiveRow(null);
                }
              } else {
                setPendingDecision('REJECTED');
              }
            }}
            row={activeRow}
          />
        )}
        {!admin.loading && !admin.error && !admin.forbidden && (
          <CursorPageControls
            page={admin.paging.page}
            count={resultCount}
            nextCursor={admin.nextCursor}
            busy={admin.refreshing}
            previous={admin.paging.previous}
            next={admin.paging.next}
          />
        )}
      </PageShell>
    </div>
  );
}

function Kpi({
  active,
  detail,
  icon: Icon,
  label,
  loading,
  onClick,
  suffix = '',
  tone,
  value,
}: {
  active: boolean;
  detail: string;
  icon: LucideIcon;
  label: string;
  loading: boolean;
  onClick: () => void;
  suffix?: string;
  tone: 'amber' | 'green' | 'neutral' | 'blue';
  value: number;
}) {
  const toneClass = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    neutral: 'bg-muted text-muted-foreground',
    blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  }[tone];
  return (
    <button
      aria-pressed={active}
      className={`group min-w-0 rounded-lg border bg-card p-2.5 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3 ${active ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'}`}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid size-7 shrink-0 place-items-center rounded-md ${toneClass}`}>
            <Icon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-xl font-semibold leading-none tabular-nums text-foreground">
          {loading ? (
            <span
              aria-label="Loading"
              className="inline-block h-6 w-10 animate-pulse rounded bg-muted"
            />
          ) : (
            <>
              {value}
              {suffix}
            </>
          )}
        </div>
        <span className="truncate text-[10px] text-muted-foreground">{detail}</span>
      </div>
    </button>
  );
}

function Notice({
  detail,
  role = 'status',
  title,
}: {
  detail: string;
  role?: 'status' | 'alert';
  title: string;
}) {
  return (
    <div
      className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
      role={role}
    >
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function monthStart(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(date: Date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
