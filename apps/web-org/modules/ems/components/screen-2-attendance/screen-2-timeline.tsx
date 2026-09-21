'use client';

import React, { useState, useMemo } from 'react';
import { AttendanceToolbar } from './attendance-toolbar';
import { AttendanceActionBar } from './attendance-action-bar';
import { TimelineTrackView } from './timeline-track-view';
import { AttendanceSummaryFooter } from './attendance-summary-footer';
import { AttendanceDetailDrawer } from '../screen-3-attendance-table/attendance-detail-drawer';
import { useAttendance } from '../../hooks/use-attendance';
import { useAttendanceWeek } from '../../hooks/use-attendance-week';
import { attendanceSummaryStats, toTimelineStatus } from '../../services/attendance-view';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import { PageShell } from '../layout/page-shell';

interface Screen2TimelineProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen2Timeline({ onToggleView }: Screen2TimelineProps) {
  const week = useAttendanceWeek();
  const {
    days: records,
    isCheckedIn,
    timerDisplay,
    requestCorrection,
    requestMissingCheckOut,
    explainHolidayCheckIn,
  } = useAttendance(30, week.window);
  const [selectedRow, setSelectedRow] = useState<AttendanceTableRow | null>(null);

  const tableRows: AttendanceTableRow[] = useMemo(() => {
    return records.map((r) => {
      const dayPunches = r.record.punches ?? [];
      const openCheckInAt =
        !r.isToday && dayPunches.at(-1)?.punchType === 'IN'
          ? dayPunches.at(-1)?.occurredAt
          : undefined;
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
        status: r.holidayConflict
          ? `${r.holidayConflict.holidayName} · ${r.holidayConflict.label}`
          : r.dayStatus === 'PRESENT'
            ? 'Present'
            : r.dayStatus,
        statusType: r.holidayConflict
          ? 'holiday-checkin'
          : r.workedMinutes > 0
            ? 'present'
            : r.isWeekend
              ? 'weekend'
              : r.dayStatus === 'HOLIDAY'
                ? 'holiday'
                : 'absent',
        dayStatus: r.dayStatus,
        isWeekend: r.isWeekend,
        holidayName: r.holidayName,
        holidayConflict: r.holidayConflict,
        record: r.record,
        openCheckInAt,
        shift: 'General Shift',
        punches: dayPunches.map((p) => ({
          type: p.punchType as 'IN' | 'OUT',
          time: new Date(p.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: p.source || 'NATIVE',
        })),
      };
    });
  }, [records]);

  const timelineDays = records.map((r) => ({
    id: r.id,
    dayLabel: r.dayLabel,
    dayOfWeek: r.dayOfWeek,
    dayNumber: r.dayNumber,
    isToday: r.isToday,
    firstInTime: r.firstInTime || undefined,
    lastOutTime: r.lastOutTime || undefined,
    workedMinutes: r.workedMinutes,
    // The open day's total is what has been recorded plus what is still being worked; anything
    // else leaves the row reading 00:00 next to a running timer on the same screen.
    inProgressMinutes:
      r.isToday && isCheckedIn
        ? r.record.workedMinutes + Math.floor(timerDisplay.totalSeconds / 60)
        : undefined,
    // A past day whose last punch is a check-in never had its check-out recorded. It counts no
    // worked time until a correction supplies one, and the row should say so rather than 00:00.
    checkOutMissing: !r.isToday && r.record.punches?.at(-1)?.punchType === 'IN',
    status: toTimelineStatus(r.dayStatus),
    holidayName: r.holidayName ?? undefined,
    // A check-in on an approved optional holiday is shown by its review state, not as "Present".
    holidayConflict: r.holidayConflict
      ? {
          label: r.holidayConflict.label,
          detail: r.holidayConflict.detail,
          tone: r.holidayConflict.tone,
        }
      : undefined,
    spanStartPercent: r.spanStartPercent ?? undefined,
    spanEndPercent: r.spanEndPercent ?? undefined,
  }));

  const stats = attendanceSummaryStats(records);

  const handleRegularize = async (recordId: string, reasonText: string) => {
    return requestCorrection(recordId, reasonText);
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 px-4 sm:px-6 bg-muted">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={week.label}
          onPrevDate={week.previous}
          onNextDate={week.next}
          viewMode="timeline"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <PageShell gap="tight">
        {/* Shift Info & Check-in / Check-out Action Bar */}
        <AttendanceActionBar />

        {/* Main Timeline Card */}
        <TimelineTrackView
          days={timelineDays}
          onSelectDay={(dayId) => {
            const found = tableRows.find((row) => row.id === dayId);
            if (found) setSelectedRow(found);
          }}
        />

        {/* Bottom Summary Metric Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </PageShell>

      {/* Slide-in Detail Drawer with Missing Check-Out & Regularization Form */}
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
