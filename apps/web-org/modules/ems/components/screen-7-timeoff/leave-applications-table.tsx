import { Button } from '@smarteam/ui';
import React from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { StandardDataTable } from '@smarteam/ui';
import type { LeaveApplicationItem } from '../../types/leave.types';

interface LeaveApplicationsTableProps {
  applications: LeaveApplicationItem[];
  onSelectApplication?: (app: LeaveApplicationItem) => void;
}

export function LeaveApplicationsTable({
  applications,
  onSelectApplication,
}: LeaveApplicationsTableProps) {
  const columns: ColumnDef<LeaveApplicationItem>[] = [
    {
      id: 'leaveTypeName',
      header: 'Leave Type',
      accessorKey: 'leaveTypeName',
      sortable: true,
      filterable: true,
      pinned: 'left',
      cell: (app) => (
        <div>
          <div className="font-semibold text-slate-900 group-hover:text-primary transition-colors">
            {app.leaveTypeName}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Applied on {app.appliedOn}
          </div>
        </div>
      ),
    },
    {
      id: 'dateRange',
      header: 'Date Range',
      accessorKey: (app) => `${app.startDate} — ${app.endDate}`,
      sortable: true,
      cell: (app) => (
        <span className="text-slate-700 font-medium">
          {app.startDate} — {app.endDate}
        </span>
      ),
    },
    {
      id: 'dayCount',
      header: 'Duration',
      accessorKey: 'dayCount',
      sortable: true,
      cell: (app) => (
        <span className="font-mono font-bold text-slate-800">
          {app.dayCount} {app.dayCount === 1 ? 'Day' : 'Days'}
        </span>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      accessorKey: 'reason',
      sortable: false,
      cell: (app) => <div className="text-slate-600 max-w-xs truncate">{app.reason}</div>,
    },
    {
      id: 'approverName',
      header: 'Approver',
      accessorKey: 'approverName',
      sortable: true,
      filterable: true,
      cell: (app) => <span className="text-slate-700 font-medium">{app.approverName}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      filterable: true,
      filterOptions: [
        { label: 'Approved', value: 'APPROVED' },
        { label: 'Pending Approval', value: 'PENDING' },
        { label: 'Rejected', value: 'REJECTED' },
        { label: 'Cancelled', value: 'CANCELLED' },
      ],
      cell: (app) => (
        <>
          {app.status === 'APPROVED' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Approved
            </span>
          )}
          {app.status === 'PENDING' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Pending Approval
            </span>
          )}
          {app.status === 'REJECTED' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Rejected
            </span>
          )}
          {app.status === 'CANCELLED' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Cancelled
            </span>
          )}
        </>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'center',
      pinned: 'right',
      sortable: false,
      cell: (app) => (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSelectApplication?.(app);
          }}
          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          View Details
        </Button>
      ),
    },
  ];

  return (
    <StandardDataTable
      data={applications}
      columns={columns}
      keyExtractor={(app) => app.id}
      title="Recent Leave Applications"
      searchPlaceholder="Search leave applications..."
      onRowClick={onSelectApplication}
      initialRowsPerPage={10}
    />
  );
}
