'use client';

import { formatDate } from '@smarteam/contracts';
import { Button, Input, Select } from '@smarteam/ui';
import { useMemo, useState } from 'react';
import { useAttendance } from '../../hooks/use-attendance';
import { useAttendanceWeek } from '../../hooks/use-attendance-week';
import { attendanceSummaryStats } from '../../services/attendance-view';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import { PageShell } from '../layout/page-shell';
import { AttendanceSummaryFooter } from '../screen-2-attendance/attendance-summary-footer';
import { AttendanceToolbar } from '../screen-2-attendance/attendance-toolbar';
import { AttendanceDetailDrawer } from './attendance-detail-drawer';
import { AttendanceTableView } from './attendance-table-view';
import type { CorrectionTimes } from './correction-form';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

interface Screen3TableProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen3Table({ onToggleView }: Screen3TableProps) {
  const week = useAttendanceWeek();
  const {
    days: records,
    requestCorrection,
    requestMissingCheckOut,
    explainHolidayCheckIn,
    canRequestCorrection,
  } = useAttendance(30, week.window);
  const [selectedRow, setSelectedRow] = useState<AttendanceTableRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const settledSearch = useDebouncedValue(searchQuery.trim());
  const [isFilterActive, setIsFilterActive] = useState<boolean>(false);

  // Map attendance records to AttendanceTableRow
  const rows: AttendanceTableRow[] = useMemo(() => {
    return records.map((r) => {
      const dayPunches = r.record.punches ?? [];
      return {
        id: r.id,
        date: formatDate(r.workDate),
        workDate: r.workDate,
        checkInAt: r.record.punches?.find((p) => p.punchType === 'IN')?.occurredAt,
        checkOutAt: r.record.punches?.filter((p) => p.punchType === 'OUT').at(-1)?.occurredAt,
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
        // A check-in on an approved optional holiday reads by its review state, not "Present".
        status: r.holidayConflict
          ? `${r.holidayConflict.holidayName} · ${r.holidayConflict.label}`
          : r.workedMinutes > 0 || r.dayStatus === 'PRESENT'
            ? 'Present'
            : r.dayStatus === 'HALF_DAY'
              ? 'Half day'
              : r.dayStatus === 'LEAVE' || r.dayStatus === 'ON_LEAVE'
                ? 'On leave'
                : r.dayStatus === 'HOLIDAY' || r.holidayName
                  ? 'Holiday'
                  : r.isWeekend
                    ? 'Weekly off'
                    : 'Absent',
        statusType: r.holidayConflict
          ? 'holiday-checkin'
          : r.workedMinutes > 0 || r.dayStatus === 'PRESENT'
            ? 'present'
            : r.dayStatus === 'HALF_DAY'
              ? 'half-day'
              : r.dayStatus === 'LEAVE' || r.dayStatus === 'ON_LEAVE'
                ? 'leave'
                : r.dayStatus === 'HOLIDAY' || r.holidayName
                  ? 'holiday'
                  : r.isWeekend
                    ? 'weekend'
                    : 'absent',
        ...(r.holidayConflict ? { holidayConflict: r.holidayConflict } : {}),
        shift: r.shiftName ?? 'General Shift',
        canRegularize: canRequestCorrection && r.correctionStatus !== 'PENDING',
        // A past day that ended on a check-in: the drawer offers to add the missing check-out.
        openCheckInAt:
          !r.isToday && dayPunches.at(-1)?.punchType === 'IN'
            ? String(dayPunches.at(-1)?.occurredAt)
            : undefined,
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
      if (settledSearch) {
        const q = settledSearch.toLowerCase();
        return (
          row.date.toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q) ||
          row.shift.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, statusFilter, settledSearch]);

  const stats = attendanceSummaryStats(records);

  /**
   * Raises the correction and lets the drawer see the outcome.
   *
   * The drawer awaits this promise, so a rejection — carrying the API's reason — is what tells it
   * to stay open. Swallowing the result here is what once let a rejected correction close the
   * drawer as though it had been accepted.
   */
  // The form shows it was sent, then closes the drawer itself.
  const handleRegularize = (recordId: string, reason: string, times?: CorrectionTimes) =>
    requestCorrection(recordId, reason, times);

  return (
    <div className="w-full max-w-full flex flex-col relative overflow-x-hidden">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 px-3 sm:px-6 bg-muted dark:bg-background">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={week.label}
          onPrevDate={week.previous}
          onNextDate={week.next}
          dateWindow={week.window}
          onSelectRange={week.selectRange}
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
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400">
                Filter Status:
              </span>
              <div className="w-full min-w-0 sm:w-40">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">All statuses</option>
                  <option value="present">Present</option>
                  <option value="holiday">Holiday</option>
                  <option value="holiday-checkin">Worked on holiday</option>
                  <option value="weekend">Weekly off</option>
                  <option value="empty">Missed / Empty</option>
                </Select>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search attendance"
                placeholder="Search table…"
                className="w-full min-w-0 sm:w-48"
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
        onSubmitMissingCheckOut={requestMissingCheckOut}
        onExplainHolidayCheckIn={explainHolidayCheckIn}
      />
    </div>
  );
}
