import React from 'react';
import { LeaveApplicationItem } from '../../types/leave.types';

interface LeaveApplicationsTableProps {
  applications: LeaveApplicationItem[];
  onSelectApplication?: (app: LeaveApplicationItem) => void;
}

export function LeaveApplicationsTable({
  applications,
  onSelectApplication,
}: LeaveApplicationsTableProps) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto no-scrollbar">
      {/* Table Section Header */}

      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <h3 className="!text-xs !font-bold !text-slate-800 !m-0">
          Recent Leave Applications
        </h3>
        <span className="text-[11px] text-slate-500 font-medium">
          Showing {applications.length} records
        </span>
      </div>

      <table className="w-full text-left text-xs border-collapse min-w-[780px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-700 font-semibold">
            <th className="py-3 px-4">Leave Type</th>
            <th className="py-3 px-3">Date Range</th>
            <th className="py-3 px-3">Duration</th>
            <th className="py-3 px-4">Reason</th>
            <th className="py-3 px-4">Approver</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {applications.map((app) => (
            <tr
              key={app.id}
              onClick={() => onSelectApplication && onSelectApplication(app)}
              className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
            >
              {/* 1. Leave Type */}
              <td className="py-3 px-4">
                <div className="font-semibold text-slate-900 group-hover:text-[#0284C7] transition-colors">
                  {app.leaveTypeName}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Applied on {app.appliedOn}
                </div>
              </td>

              {/* 2. Date Range */}
              <td className="py-3 px-3 text-slate-700 font-medium">
                {app.startDate} — {app.endDate}
              </td>

              {/* 3. Duration */}
              <td className="py-3 px-3 font-mono font-bold text-slate-800">
                {app.dayCount} {app.dayCount === 1 ? 'Day' : 'Days'}
              </td>

              {/* 4. Reason */}
              <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                {app.reason}
              </td>

              {/* 5. Approver */}
              <td className="py-3 px-4 text-slate-700 font-medium">
                {app.approverName}
              </td>

              {/* 6. Status Badge */}
              <td className="py-3 px-3">
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
              </td>

              {/* 7. Actions */}
              <td className="py-3 px-4 text-center">
                <button
                  className="text-xs font-semibold text-[#0284C7] hover:underline"
                >
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
