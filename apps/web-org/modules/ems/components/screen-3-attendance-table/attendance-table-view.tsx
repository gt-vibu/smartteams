import React from 'react';
import { AttendanceTableRow } from '../../types/attendance-table.types';

interface AttendanceTableViewProps {
  rows: AttendanceTableRow[];
  onSelectRow: (row: AttendanceTableRow) => void;
}

export function AttendanceTableView({ rows, onSelectRow }: AttendanceTableViewProps) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto no-scrollbar">
      <table className="w-full text-left text-xs border-collapse min-w-[800px]">
        {/* Table Header (Sticky) */}
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs text-slate-700 font-semibold shadow-2xs">
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-3">First In</th>
            <th className="py-3 px-3">Last Out</th>
            <th className="py-3 px-3">Total Hours</th>
            <th className="py-3 px-3">Payable Hours</th>
            <th className="py-3 px-3">Overtime/Deviation</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Shift(s)</th>
            <th className="py-3 px-4 text-center">Regularization</th>
          </tr>
        </thead>


        {/* Table Body */}
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelectRow(row)}
              className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
            >
              {/* 1. Date */}
              <td className="py-3 px-4 font-semibold text-slate-900 group-hover:text-[#0284C7] transition-colors">
                {row.date}
              </td>

              {/* 2. First In */}
              <td className="py-3 px-3 font-mono text-slate-600">
                {row.firstIn}
              </td>

              {/* 3. Last Out */}
              <td className="py-3 px-3 font-mono text-slate-600">
                {row.lastOut}
              </td>

              {/* 4. Total Hours */}
              <td className="py-3 px-3 font-mono font-medium text-slate-800">
                {row.totalHours}
              </td>

              {/* 5. Payable Hours */}
              <td className="py-3 px-3 font-mono font-medium text-slate-800">
                {row.payableHours}
              </td>

              {/* 6. Overtime/Deviation */}
              <td className={`py-3 px-3 font-mono font-medium ${
                row.overtime !== '-' && row.overtime !== '00:00'
                  ? 'text-rose-600'
                  : 'text-emerald-700'
              }`}>
                {row.overtime}
              </td>

              {/* 7. Status Badge */}
              <td className="py-3 px-4">
                {row.statusType === 'present' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Present
                  </span>
                )}

                {row.statusType === 'weekend-present' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Weekend, Present
                  </span>
                )}

                {row.statusType === 'holiday' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    {row.status}
                  </span>
                )}

                {row.statusType === 'weekend' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Weekend
                  </span>
                )}

                {row.statusType === 'empty' && (
                  <span className="text-slate-400 font-mono">-</span>
                )}
              </td>

              {/* 8. Shift */}
              <td className="py-3 px-4 text-slate-600">
                {row.shift}
              </td>

              {/* 9. Regularization */}
              <td className="py-3 px-4 text-center">
                {row.canRegularize ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRow(row);
                    }}
                    className="text-[11px] font-semibold text-[#0284C7] hover:text-[#0369A1] hover:underline"
                  >
                    Regularize
                  </button>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
