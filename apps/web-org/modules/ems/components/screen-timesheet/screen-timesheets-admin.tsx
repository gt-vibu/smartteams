'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { StandardDataTable, Select } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';

interface TimesheetAuditRecord {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  period: string;
  totalHours: number;
  billableHours: number;
  projectBreakdown: { projectName: string; hours: number }[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  submittedAt: string | null;
}

const INITIAL_TIMESHEETS: TimesheetAuditRecord[] = [
  {
    id: 'ts-064',
    employeeId: 'user-064',
    employeeNumber: 'EMP-064',
    employeeName: 'Mithun Gowda H',
    department: 'Engineering & Technology',
    period: '2026-W35 (24 Aug – 30 Aug)',
    totalHours: 42.5,
    billableHours: 40.0,
    projectBreakdown: [
      { projectName: 'EMS v2 / Luxasia 2026', hours: 35.0 },
      { projectName: 'Code Review & Sprint Planning', hours: 7.5 },
    ],
    status: 'SUBMITTED',
    submittedAt: '2026-08-27 18:30',
  },
  {
    id: 'ts-010',
    employeeId: 'user-010',
    employeeNumber: 'EMP-010',
    employeeName: 'Rohan Das',
    department: 'Engineering & Technology',
    period: '2026-W35 (24 Aug – 30 Aug)',
    totalHours: 44.0,
    billableHours: 44.0,
    projectBreakdown: [
      { projectName: 'EMS v2 / Luxasia 2026', hours: 22.0 },
      { projectName: 'Payroll Automation Q2', hours: 22.0 },
    ],
    status: 'SUBMITTED',
    submittedAt: '2026-08-27 19:15',
  },
  {
    id: 'ts-002',
    employeeId: 'user-002',
    employeeNumber: 'EMP-002',
    employeeName: 'Priya Sharma',
    department: 'Product & Design',
    period: '2026-W35 (24 Aug – 30 Aug)',
    totalHours: 40.0,
    billableHours: 38.0,
    projectBreakdown: [{ projectName: 'EMS v2 / Luxasia 2026', hours: 40.0 }],
    status: 'APPROVED',
    submittedAt: '2026-08-27 17:00',
  },
  {
    id: 'ts-042',
    employeeId: 'user-042',
    employeeNumber: 'EMP-042',
    employeeName: 'Swati Pande',
    department: 'Marketing & Growth',
    period: '2026-W35 (24 Aug – 30 Aug)',
    totalHours: 38.0,
    billableHours: 30.0,
    projectBreakdown: [{ projectName: 'Growth Experiments Q3', hours: 38.0 }],
    status: 'DRAFT',
    submittedAt: null,
  },
];

export function ScreenTimesheetsAdmin() {
  const { canApprove } = useAuth();
  const [timesheets, setTimesheets] = useState<TimesheetAuditRecord[]>(INITIAL_TIMESHEETS);
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [activeDrawerRecord, setActiveDrawerRecord] = useState<TimesheetAuditRecord | null>(null);

  const filtered = timesheets.filter((t) => {
    if (selectedPeriod !== 'ALL' && !t.period.includes(selectedPeriod)) return false;
    if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;
    return true;
  });

  const handleApprove = (id: string) => {
    setTimesheets(timesheets.map((t) => (t.id === id ? { ...t, status: 'APPROVED' } : t)));
    if (activeDrawerRecord?.id === id) {
      setActiveDrawerRecord({ ...activeDrawerRecord, status: 'APPROVED' });
    }
  };

  const handleReject = (id: string) => {
    setTimesheets(timesheets.map((t) => (t.id === id ? { ...t, status: 'REJECTED' } : t)));
    if (activeDrawerRecord?.id === id) {
      setActiveDrawerRecord({ ...activeDrawerRecord, status: 'REJECTED' });
    }
  };

  return (
    <div className="w-full">
      {/* 1. Sub-Header Toolbar Strip — Sticky White Strip */}
      <div className="sticky top-0 z-20 bg-background">
        <div className="bg-card/95 backdrop-blur-md px-4 sm:px-6 py-2.5 border-b border-border/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 w-full shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center space-x-4">
            <span className="text-xs font-bold text-foreground border-b-2 border-slate-900 pb-1">
              Time Logs & Timesheets
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-36">
              <Select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                <option value="ALL">All Periods</option>
                <option value="W35">Current Week (W35)</option>
                <option value="W34">Previous Week (W34)</option>
              </Select>
            </div>

            <div className="w-48">
              <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted (Pending Review)</option>
                <option value="APPROVED">Approved</option>
                <option value="DRAFT">Draft</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-card rounded-[6px] border border-border/90 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                Admin Governance
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-medium text-muted-foreground">
                Timesheet Audit & Approvals
              </span>
            </div>
            <h1 className="mt-1 text-lg font-bold text-foreground">Timesheet Operations</h1>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card p-3.5 rounded-[6px] border border-border/90 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Pending Review
            </div>
            <div className="text-xl font-bold text-amber-600 mt-0.5">
              {timesheets.filter((t) => t.status === 'SUBMITTED').length}
            </div>
          </div>
          <div className="bg-card p-3.5 rounded-[6px] border border-border/90 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Approved
            </div>
            <div className="text-xl font-bold text-emerald-600 mt-0.5">
              {timesheets.filter((t) => t.status === 'APPROVED').length}
            </div>
          </div>
          <div className="bg-card p-3.5 rounded-[6px] border border-border/90 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Draft / In Progress
            </div>
            <div className="text-xl font-bold text-muted-foreground mt-0.5">
              {timesheets.filter((t) => t.status === 'DRAFT').length}
            </div>
          </div>
          <div className="bg-card p-3.5 rounded-[6px] border border-border/90 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Logged Hours
            </div>
            <div className="text-xl font-bold text-sky-700 mt-0.5">
              {timesheets.reduce((acc, t) => acc + t.totalHours, 0).toFixed(1)} hrs
            </div>
          </div>
        </div>

        {/* Timesheet Audit Table */}
        {(() => {
          const columns: ColumnDef<TimesheetAuditRecord>[] = [
            {
              id: 'employeeName',
              header: 'Employee',
              accessorKey: 'employeeName',
              sortable: true,
              pinned: 'left',
              cell: (row) => (
                <div>
                  <div className="font-bold text-foreground group-hover:text-sky-700 transition-colors">
                    {row.employeeName}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {row.employeeNumber} · {row.department}
                  </div>
                </div>
              ),
            },
            {
              id: 'period',
              header: 'Period',
              accessorKey: 'period',
              sortable: true,
              filterable: true,
              cell: (row) => <span className="font-medium text-foreground">{row.period}</span>,
            },
            {
              id: 'totalHours',
              header: 'Total Logged',
              accessorKey: 'totalHours',
              sortable: true,
              cell: (row) => (
                <span className="font-mono font-bold text-foreground">{row.totalHours} hrs</span>
              ),
            },
            {
              id: 'billableHours',
              header: 'Billable',
              accessorKey: 'billableHours',
              sortable: true,
              cell: (row) => (
                <span className="font-mono text-emerald-700 font-medium">
                  {row.billableHours} hrs
                </span>
              ),
            },
            {
              id: 'projectAllocation',
              header: 'Project Allocation',
              sortable: false,
              cell: (row) => (
                <div className="flex flex-wrap gap-1 max-w-[280px]">
                  {row.projectBreakdown.map((p, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-semibold bg-muted text-foreground px-1.5 py-0.5 rounded border border-border"
                    >
                      {p.projectName} ({p.hours}h)
                    </span>
                  ))}
                </div>
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
              cell: (row) => (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    row.status === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : row.status === 'REJECTED'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : row.status === 'SUBMITTED'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {row.status}
                </span>
              ),
            },
            {
              id: 'actions',
              header: 'Actions',
              align: 'right',
              pinned: 'right',
              sortable: false,
              cell: (row) => {
                const isAuthorized = canApprove('TIMESHEET', {
                  requesterId: row.employeeId,
                  employeeId: row.employeeId,
                });
                return row.status === 'SUBMITTED' ? (
                  isAuthorized ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-end gap-1.5"
                    >
                      <Button
                        onClick={() => handleApprove(row.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded transition-colors shadow-2xs cursor-pointer"
                      >
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleReject(row.id)}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded transition-colors shadow-2xs cursor-pointer"
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Pending Review</span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground font-mono">Completed</span>
                );
              },
            },
          ];

          return (
            <StandardDataTable
              data={filtered}
              columns={columns}

              keyExtractor={(row) => row.id}
              searchPlaceholder="Search employee name, department, project..."
              onRowClick={(row) => setActiveDrawerRecord(row)}
              initialRowsPerPage={10}
            />
          );
        })()}

        {/* Timesheet Audit Detail Drawer */}
        {activeDrawerRecord && (
          <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
            <div
              onClick={() => setActiveDrawerRecord(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <div className="w-screen max-w-md bg-card shadow-2xl border-l border-border flex flex-col justify-between">
                <div className="p-5 border-b border-border bg-muted/40/80 flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold bg-slate-200 text-muted-foreground px-1.5 py-0.5 rounded">
                      {activeDrawerRecord.employeeNumber}
                    </span>
                    <h2 className="text-sm font-bold text-foreground mt-1">
                      {activeDrawerRecord.employeeName}
                    </h2>
                    <p className="text-xs text-muted-foreground">{activeDrawerRecord.period}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveDrawerRecord(null)}
                    className="h-7 w-7 rounded text-muted-foreground hover:text-foreground hover:bg-slate-200 cursor-pointer"
                  >
                    ✕
                  </Button>
                </div>

                <div className="p-5 space-y-4 flex-1 overflow-y-auto text-xs">
                  <div className="bg-muted/40 p-3.5 rounded-[6px] border border-border grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">
                        Total Hours
                      </span>
                      <p className="text-sm font-bold text-foreground font-mono mt-0.5">
                        {activeDrawerRecord.totalHours} hrs
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">
                        Billable Hours
                      </span>
                      <p className="text-sm font-bold text-emerald-700 font-mono mt-0.5">
                        {activeDrawerRecord.billableHours} hrs
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">
                        Submission Status
                      </span>
                      <p className="font-semibold text-foreground mt-0.5">
                        {activeDrawerRecord.status}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">
                        Submitted At
                      </span>
                      <p className="font-mono text-muted-foreground mt-0.5">
                        {activeDrawerRecord.submittedAt || 'Not Submitted'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">
                      Project Allocations
                    </h3>
                    <div className="space-y-2">
                      {activeDrawerRecord.projectBreakdown.map((p, i) => (
                        <div
                          key={i}
                          className="p-3 bg-muted/40 border border-border rounded-[6px] flex items-center justify-between"
                        >
                          <div className="font-semibold text-foreground">{p.projectName}</div>
                          <div className="font-mono font-bold text-foreground">{p.hours} hrs</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-border bg-muted/40 flex items-center gap-2">
                  {activeDrawerRecord.status === 'SUBMITTED' &&
                  canApprove('TIMESHEET', {
                    requesterId: activeDrawerRecord.employeeId,
                    employeeId: activeDrawerRecord.employeeId,
                  }) ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(activeDrawerRecord.id)}
                        className="flex-1 py-2 font-bold rounded text-xs cursor-pointer transition-colors"
                      >
                        Reject Timesheet
                      </Button>
                      <Button
                        variant="success"
                        onClick={() => handleApprove(activeDrawerRecord.id)}
                        className="flex-1 py-2 font-bold rounded text-xs cursor-pointer transition-colors"
                      >
                        Approve Timesheet
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      onClick={() => setActiveDrawerRecord(null)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded text-xs cursor-pointer transition-colors"
                    >
                      Close Inspection
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
