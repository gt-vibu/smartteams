'use client';

import React, { useState, useMemo } from 'react';
import { AttendanceToolbar } from '../screen-2-attendance/attendance-toolbar';
import { AttendanceTableView } from './attendance-table-view';
import { AttendanceDetailDrawer } from './attendance-detail-drawer';
import { AttendanceSummaryFooter } from '../screen-2-attendance/attendance-summary-footer';
import { useAttendance } from '../../hooks/use-attendance';
import { AttendanceTableRow } from '../../types/attendance-table.types';

interface Screen3TableProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen3Table({ onToggleView }: Screen3TableProps) {
  const { records, punches, regularize } = useAttendance();
  const [selectedRow, setSelectedRow] = useState<AttendanceTableRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterActive, setIsFilterActive] = useState<boolean>(false);

  // Map attendance records to AttendanceTableRow
  const rows: AttendanceTableRow[] = useMemo(() => {
    return records.map((r) => {
      const dayPunches = punches.filter((p) => p.date === r.workDate);
      return {
        id: r.id,
        date: `${r.dayLabel}-${r.workDate.slice(0, 4)}`,
        firstIn: r.firstInTime || '-',
        lastOut: r.lastOutTime || (r.isToday && r.firstInTime ? 'Active (In)' : '-'),
        totalHours: r.workedMinutes > 0 ? `${Math.floor(r.workedMinutes / 60).toString().padStart(2, '0')}:${(r.workedMinutes % 60).toString().padStart(2, '0')}` : '-',
        payableHours: r.payableHours,
        overtime: r.overtime,
        status: r.holidayName || (r.dayStatus === 'PRESENT' ? 'Present' : r.dayStatus === 'WEEKEND' ? 'Weekend' : r.dayStatus),
        statusType: r.statusType,
        shift: r.shiftName || 'General Shift',
        canRegularize: r.canRegularize,
        punches: dayPunches.map((p) => ({
          type: p.type,
          time: p.time,
          source: p.source,
        })),
      };
    });
  }, [records, punches]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.statusType !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          row.date.toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q) ||
          row.shift.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  const stats = {
    payableDays: records.filter((r) => r.dayStatus === 'PRESENT' || r.dayStatus === 'WEEKEND').length,
    presentDays: records.filter((r) => r.dayStatus === 'PRESENT').length,
    onDutyDays: 0,
    paidLeaveDays: records.filter((r) => r.dayStatus === 'LEAVE').length,
    holidayDays: records.filter((r) => r.dayStatus === 'HOLIDAY').length,
    weekendDays: records.filter((r) => r.dayStatus === 'WEEKEND').length,
  };

  const handleRegularize = (recordId: string, reason: string) => {
    regularize(recordId, reason);
    setSelectedRow(null);
  };

  return (
    <div className="w-full flex flex-col relative">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-[#EEF2F6]">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange="23-Aug-2026 - 29-Aug-2026"
          viewMode="table"
          onChangeViewMode={onToggleView}
          onFilterToggle={() => setIsFilterActive(!isFilterActive)}
          isFilterActive={isFilterActive}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 space-y-3.5 pt-3.5">
        {/* Optional Filter Controls Bar */}
        {isFilterActive && (
          <div className="bg-white border border-slate-200 rounded-[6px] p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2.5 py-1 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="present">Present</option>
                <option value="holiday">Holiday</option>
                <option value="weekend">Weekend</option>
                <option value="empty">Missed / Empty</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search table..."
                className="text-xs border border-slate-200 rounded px-3 py-1 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {(statusFilter !== 'ALL' || searchQuery) && (
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="text-xs text-sky-600 font-semibold hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. 9-Column Attendance Data Table */}
        {filteredRows.length > 0 ? (
          <AttendanceTableView
            rows={filteredRows}
            onSelectRow={(row) => setSelectedRow(row)}
          />
        ) : (
          <div className="bg-white rounded-[6px] border border-slate-200/90 p-8 text-center space-y-2">
            <div className="text-sm font-bold text-slate-700">No attendance records found</div>
            <p className="text-xs text-slate-500">Try adjusting your filters or date range.</p>
          </div>
        )}

        {/* 3. Bottom Summary Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </div>

      {/* 4. Context-Preserving Slide-in Detail Drawer */}
      <AttendanceDetailDrawer
        row={selectedRow}
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        onSubmitRegularization={handleRegularize}
      />
    </div>
  );
}

