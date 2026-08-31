'use client';

import React from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { Button, StandardDataTable } from '@smarteam/ui';
import type { AttendanceTableRow } from '../../types/attendance-table.types';

interface AttendanceTableViewProps {
  rows: AttendanceTableRow[];
  onSelectRow: (row: AttendanceTableRow) => void;
}

// ─── Status badge helper ──────────────────────────────────────────────────────
function StatusBadge({ row }: { row: AttendanceTableRow }) {
  if (row.statusType === 'present') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        Present
      </span>
    );
  }
  if (row.statusType === 'weekend-present') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
        Weekend, Present
      </span>
    );
  }
  if (row.statusType === 'holiday') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200/70">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
        {row.status}
      </span>
    );
  }
  if (row.statusType === 'weekend') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        Weekend
      </span>
    );
  }
  return <span className="text-slate-400 font-mono">-</span>;
}

// ─── Mobile card list ─────────────────────────────────────────────────────────
function AttendanceMobileCards({ rows, onSelectRow }: AttendanceTableViewProps) {
  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-card rounded-xl border border-slate-200/90 dark:border-border p-8 text-center space-y-2">
        <div className="text-sm font-bold text-slate-700 dark:text-white">
          No attendance records found
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Try adjusting your filters or date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const overtimeColored =
          row.overtime !== '-' && row.overtime !== '00:00'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-emerald-700 dark:text-emerald-400';

        return (
          <div
            key={row.id}
            onClick={() => onSelectRow(row)}
            className="bg-white dark:bg-card rounded-xl border border-slate-200/80 dark:border-border shadow-xs overflow-hidden cursor-pointer active:bg-sky-50/40 dark:active:bg-slate-800/60 transition-colors"
          >
            {/* Card header: Date + Status */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 dark:bg-card border-b border-slate-100 dark:border-border">
              <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
                {row.date}
              </span>
              <StatusBadge row={row} />
            </div>

            {/* Card body: 2-column grid of key-value pairs */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
              {/* First In */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  First In
                </span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-200">
                  {row.firstIn}
                </span>
              </div>

              {/* Last Out */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Last Out
                </span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-200">
                  {row.lastOut}
                </span>
              </div>

              {/* Total Hours */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Total Hours
                </span>
                <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-100">
                  {row.totalHours}
                </span>
              </div>

              {/* Payable Hours */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Payable Hrs
                </span>
                <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-100">
                  {row.payableHours}
                </span>
              </div>

              {/* Overtime / Deviation */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Overtime/Dev
                </span>
                <span className={`text-xs font-mono font-medium ${overtimeColored}`}>
                  {row.overtime}
                </span>
              </div>

              {/* Shift */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Shift
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  {row.shift}
                </span>
              </div>
            </div>

            {/* Regularization footer — only when available */}
            {row.canRegularize && (
              <div className="px-4 pb-3">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRow(row);
                  }}
                  className="w-full py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-xs font-semibold text-primary dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
                >
                  Regularize →
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Desktop table (via StandardDataTable) ────────────────────────────────────
function AttendanceDesktopTable({ rows, onSelectRow }: AttendanceTableViewProps) {
  const columns: ColumnDef<AttendanceTableRow>[] = [
    {
      id: 'date',
      header: 'Date',
      accessorKey: 'date',
      sortable: true,
      pinned: 'left',
      cell: (row) => (
        <span className="font-semibold text-slate-900 dark:text-white group-hover:text-primary transition-colors whitespace-nowrap">
          {row.date}
        </span>
      ),
    },
    {
      id: 'firstIn',
      header: 'First In',
      accessorKey: 'firstIn',
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {row.firstIn}
        </span>
      ),
    },
    {
      id: 'lastOut',
      header: 'Last Out',
      accessorKey: 'lastOut',
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {row.lastOut}
        </span>
      ),
    },
    {
      id: 'totalHours',
      header: 'Total Hours',
      accessorKey: 'totalHours',
      sortable: true,
      cell: (row) => (
        <span className="font-mono font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {row.totalHours}
        </span>
      ),
    },
    {
      id: 'payableHours',
      header: 'Payable Hours',
      accessorKey: 'payableHours',
      sortable: true,
      cell: (row) => (
        <span className="font-mono font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {row.payableHours}
        </span>
      ),
    },
    {
      id: 'overtime',
      header: 'Overtime/Deviation',
      accessorKey: 'overtime',
      sortable: true,
      cell: (row) => (
        <span
          className={`font-mono font-medium whitespace-nowrap ${
            row.overtime !== '-' && row.overtime !== '00:00'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {row.overtime}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      filterable: true,
      filterOptions: [
        { label: 'Present', value: 'Present' },
        { label: 'Weekend, Present', value: 'Weekend, Present' },
        { label: 'Weekend', value: 'Weekend' },
        { label: 'Holiday', value: 'Holiday' },
      ],
      cell: (row) => <StatusBadge row={row} />,
    },
    {
      id: 'shift',
      header: 'Shift(s)',
      accessorKey: 'shift',
      filterable: true,
      cell: (row) => <span className="text-slate-600 dark:text-slate-300">{row.shift}</span>,
    },
    {
      id: 'regularize',
      header: 'Regularization',
      align: 'center',
      pinned: 'right',
      sortable: false,
      cell: (row) =>
        row.canRegularize ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelectRow(row);
            }}
            className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shadow-2xs"
          >
            Regularize
          </Button>
        ) : (
          <span className="text-slate-400 dark:text-slate-600">-</span>
        ),
    },
  ];

  return (
    <StandardDataTable
      data={rows}
      columns={columns}
      keyExtractor={(row) => row.id}
      searchPlaceholder="Search attendance records by date, status, shift..."
      onRowClick={onSelectRow}
      initialRowsPerPage={10}
    />
  );
}

// ─── Main export: switches presentation based on viewport ─────────────────────
export function AttendanceTableView({ rows, onSelectRow }: AttendanceTableViewProps) {
  return (
    <>
      {/* Mobile: stacked card list — hidden on md+ */}
      <div className="md:hidden">
        <AttendanceMobileCards rows={rows} onSelectRow={onSelectRow} />
      </div>

      {/* Desktop: full data table — hidden on mobile */}
      <div className="hidden md:block">
        <AttendanceDesktopTable rows={rows} onSelectRow={onSelectRow} />
      </div>
    </>
  );
}
