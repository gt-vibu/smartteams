'use client';

import React, { useState, useMemo } from 'react';
import { Button, Select, Input } from '@smarteam/ui';
import { AttendanceToolbar } from '../screen-2-attendance/attendance-toolbar';
import { AttendanceTableView } from './attendance-table-view';
import { AttendanceDetailDrawer } from './attendance-detail-drawer';
import { AttendanceSummaryFooter } from '../screen-2-attendance/attendance-summary-footer';
import { useAttendance } from '../../hooks/use-attendance';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import { formatDateRangeFromValues } from '../../utils/formatters';
import { PageShell } from '../layout/page-shell';

interface Screen3TableProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen3Table({ onToggleView }: Screen3TableProps) {
  const { days: records, requestCorrection, canRequestCorrection, saveError } = useAttendance();
  const [selectedRow, setSelectedRow] = useState<AttendanceTableRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterActive, setIsFilterActive] = useState<boolean>(false);

  // Map attendance records to AttendanceTableRow
  const rows: AttendanceTableRow[] = useMemo(() => {
    return records.map((r) => {
      const dayPunches = r.record.punches ?? [];
      return {
        id: r.id,
        date: `${r.dayLabel}-${r.workDate.slice(0, 4)}`,
        firstIn: r.firstInTime || '-',
        lastOut: r.lastOutTime || (r.isToday && r.firstInTime ? 'Active (In)' : '-'),
        totalHours:
          r.workedMinutes > 0
            ? `${Math.floor(r.workedMinutes / 60)
                .toString()
                .padStart(2, '0')}:${(r.workedMinutes % 60).toString().padStart(2, '0')}`
            : '-',
        payableHours: r.workedLabel,
        overtime: r.overtimeLabel,
        status: r.dayStatus === 'PRESENT' ? 'Present' : r.dayStatus,
        statusType: r.workedMinutes > 0 ? 'present' : r.isWeekend ? 'weekend' : 'empty',
        // Shift assignment is not wired, so the row states that rather than naming a shift.
        shift: r.shiftName ?? 'Not recorded',
        canRegularize: canRequestCorrection && r.correctionStatus !== 'PENDING',
        punches: dayPunches.map((p) => ({
          type: p.punchType === 'IN' ? ('IN' as const) : ('OUT' as const),
          time: new Date(p.occurredAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }),
          source: p.source ?? 'NATIVE',
        })),
      };
    });
  }, [records, canRequestCorrection]);

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
    payableDays: records.filter((r) => r.dayStatus === 'PRESENT' || r.dayStatus === 'WEEKEND')
      .length,
    presentDays: records.filter((r) => r.dayStatus === 'PRESENT').length,
    onDutyDays: 0,
    paidLeaveDays: records.filter((r) => r.dayStatus === 'LEAVE').length,
    holidayDays: records.filter((r) => r.dayStatus === 'HOLIDAY').length,
    weekendDays: records.filter((r) => r.dayStatus === 'WEEKEND').length,
  };
  const dateRange = formatDateRangeFromValues(records.map((record) => record.workDate));

  /**
   * Raises the correction and lets the drawer see the outcome.
   *
   * `run` reports failure by resolving `false` and holding the message in `saveError`, which is
   * the right shape for a screen that renders the error itself. The drawer awaits this promise
   * instead, so a rejection is what tells it to stay open — swallowing the result here is what
   * let a rejected correction close the drawer as though it had been accepted.
   */
  const handleRegularize = async (recordId: string, reason: string) => {
    const raised = await requestCorrection(recordId, reason);
    if (!raised) throw new Error(saveError ?? 'The correction could not be submitted.');
    setSelectedRow(null);
  };

  return (
    <div className="w-full max-w-full flex flex-col relative overflow-x-hidden">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 px-3 sm:px-6 bg-muted dark:bg-background">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={dateRange || 'Current period'}
          viewMode="table"
          onChangeViewMode={onToggleView}
          onFilterToggle={() => setIsFilterActive(!isFilterActive)}
          isFilterActive={isFilterActive}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <PageShell gap="tight">
        {/* Optional Filter Controls Bar */}
        {isFilterActive && (
          <div className="bg-card border border-border rounded-[6px] p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Filter Status:
              </span>
              <div className="w-40">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="holiday">Holiday</option>
                  <option value="weekend">Weekend</option>
                  <option value="empty">Missed / Empty</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search table..."
                className="w-48"
              />
              {(statusFilter !== 'ALL' || searchQuery) && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="text-xs text-sky-600 font-semibold hover:underline"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 2. 9-Column Attendance Data Table */}
        {filteredRows.length > 0 ? (
          <AttendanceTableView rows={filteredRows} onSelectRow={(row) => setSelectedRow(row)} />
        ) : (
          <div className="bg-card rounded-[6px] border border-border/90 p-8 text-center space-y-2">
            <div className="text-sm font-bold text-foreground">No attendance records found</div>
            <p className="text-xs text-muted-foreground">
              Try adjusting your filters or date range.
            </p>
          </div>
        )}

        {/* 3. Bottom Summary Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </PageShell>

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
