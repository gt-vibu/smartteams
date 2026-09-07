'use client';

import React from 'react';
import { AttendanceToolbar } from './attendance-toolbar';
import { AttendanceActionBar } from './attendance-action-bar';
import { TimelineTrackView } from './timeline-track-view';
import { AttendanceSummaryFooter } from './attendance-summary-footer';
import { useAttendance } from '../../hooks/use-attendance';
import { toTimelineStatus } from '../../services/attendance-view';
import { formatDateRangeFromValues } from '../../utils/formatters';
import { PageShell } from '../layout/page-shell';

interface Screen2TimelineProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen2Timeline({ onToggleView }: Screen2TimelineProps) {
  const { days: records, isCheckedIn, timerDisplay } = useAttendance();

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
        ? r.workedMinutes + Math.floor(timerDisplay.totalSeconds / 60)
        : undefined,
    status: toTimelineStatus(r.dayStatus),
    // Holiday naming is not wired; the bar is drawn from the punches alone.
    holidayName: r.holidayName ?? undefined,
    spanStartPercent: r.spanStartPercent ?? undefined,
    spanEndPercent: r.spanEndPercent ?? undefined,
  }));

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

  return (
    <div className="w-full flex flex-col">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 px-4 sm:px-6 bg-muted">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={dateRange || 'Current period'}
          viewMode="timeline"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <PageShell gap="tight">
        {/* Shift Info & Check-in / Check-out Action Bar */}
        <AttendanceActionBar />

        {/* Main Timeline Card */}
        <TimelineTrackView days={timelineDays} />

        {/* Bottom Summary Metric Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </PageShell>
    </div>
  );
}
