'use client';

import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { Button, Select, StandardDataTable } from '@smarteam/ui';
import { useTimesheetAdmin } from '../../hooks/use-timesheet-admin';
import { DecisionReasonDialog } from '../common/decision-reason-dialog';
import { OpenPeriodDialog } from './open-period-dialog';
import { StatusPill, TimesheetAuditDrawer } from './timesheet-audit-drawer';
import { toAuditRows, type TimesheetAuditRow } from './timesheet-audit-row';
import { PageShell } from '../layout/page-shell';

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
  const admin = useTimesheetAdmin();
  const [openingPeriod, setOpeningPeriod] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [activeRow, setActiveRow] = useState<TimesheetAuditRow | null>(null);

  const rows = useMemo(
    () => toAuditRows(admin.timesheets, admin.employees),
    [admin.employees, admin.timesheets],
  );
  const filtered = useMemo(
    () => (selectedStatus === 'ALL' ? rows : rows.filter((row) => row.status === selectedStatus)),
    [rows, selectedStatus],
  );

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
      filterable: true,
      filterOptions: [
        { label: 'Submitted', value: 'SUBMITTED' },
        { label: 'Approved', value: 'APPROVED' },
        { label: 'Rejected', value: 'REJECTED' },
        { label: 'Draft', value: 'DRAFT' },
      ],
      cell: (row) => <StatusPill status={row.status} />,
    },
  ];

  return (
    <div className="w-full">
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 bg-background">
        <div className="flex w-full flex-col justify-between gap-2.5 border-b border-border/90 bg-card/95 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6">
          <span className="border-b-2 border-foreground pb-1 text-xs font-bold text-foreground">
            Time logs and timesheets
          </span>
          <div className="flex items-center gap-2">
            {admin.canManagePeriods && (
              <Button onClick={() => setOpeningPeriod(true)} size="sm" type="button">
                Open a period
              </Button>
            )}
            <div className="w-48">
              <Select onChange={(e) => setSelectedStatus(e.target.value)} value={selectedStatus}>
                <option value="ALL">All statuses</option>
                <option value="SUBMITTED">Submitted (pending review)</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="DRAFT">Draft</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <DecisionReasonDialog
        busy={admin.saving}
        confirmLabel={pendingDecision === 'APPROVED' ? 'Approve timesheet' : 'Reject timesheet'}
        destructive={pendingDecision === 'REJECTED'}
        error={admin.saveError}
        isOpen={pendingDecision !== null && activeRow !== null}
        onClose={() => setPendingDecision(null)}
        onConfirm={async (reason) => {
          if (!activeRow || !pendingDecision) return;
          const ok = await admin.decide(activeRow.id, pendingDecision, reason);
          if (ok !== false) {
            setPendingDecision(null);
            setActiveRow(null);
          }
        }}
        title={pendingDecision === 'APPROVED' ? 'Approve this timesheet' : 'Reject this timesheet'}
      />

      <OpenPeriodDialog
        isOpen={openingPeriod}
        onClose={() => setOpeningPeriod(false)}
        onOpen={admin.openPeriod}
        saveError={admin.saveError}
        saving={admin.saving}
      />

      <PageShell>
        <div>
          <h1 className="text-lg font-bold text-foreground">Timesheet operations</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Submitted timesheets and their approval state.
          </p>
        </div>

        {!admin.canReadAll && !admin.loading && !admin.forbidden && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            You can see your own timesheets only. Reading the whole organization&apos;s queue needs
            the <code className="font-mono">timesheets.read.all</code> permission.
          </p>
        )}
        {admin.saveError && (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
            role="alert"
          >
            {admin.saveError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Pending review"
            tone="text-amber-600 dark:text-amber-500"
            value={rows.filter((row) => row.status === 'SUBMITTED').length}
          />
          <Kpi
            label="Approved"
            tone="text-emerald-600 dark:text-emerald-400"
            value={rows.filter((row) => row.status === 'APPROVED').length}
          />
          <Kpi
            label="Draft"
            tone="text-muted-foreground"
            value={rows.filter((row) => row.status === 'DRAFT').length}
          />
          <Kpi
            label="Total logged hours"
            suffix=" hrs"
            tone="text-sky-700 dark:text-sky-400"
            value={Math.round(rows.reduce((sum, row) => sum + row.totalHours, 0) * 10) / 10}
          />
        </div>

        {admin.forbidden ? (
          <Notice detail="You do not have permission to read timesheets." title="Not available" />
        ) : admin.loading ? (
          <p className="py-10 text-center text-xs text-muted-foreground" role="status">
            Loading timesheets...
          </p>
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
            initialRowsPerPage={10}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => setActiveRow(row)}
            searchPlaceholder="Search employee name or number..."
          />
        )}

        {activeRow && (
          <TimesheetAuditDrawer
            busy={admin.saving}
            canDecide={admin.canDecide}
            onClose={() => setActiveRow(null)}
            // The approver is asked why rather than having a canned string posted for them: this
            // comment is the audit record and is shown to the employee.
            onDecide={(status) => setPendingDecision(status)}
            row={activeRow}
          />
        )}
      </PageShell>
    </div>
  );
}

function Kpi({
  label,
  suffix = '',
  tone,
  value,
}: {
  label: string;
  suffix?: string;
  tone: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border/90 bg-card p-3.5 shadow-2xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {suffix}
      </div>
    </div>
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
