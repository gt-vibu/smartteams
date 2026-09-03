'use client';

import React from 'react';
import { AttendanceToolbar } from './attendance-toolbar';
import { AttendanceActionBar } from './attendance-action-bar';
import { TimelineTrackView } from './timeline-track-view';
import { AttendanceSummaryFooter } from './attendance-summary-footer';
import { useAttendance } from '../../hooks/use-attendance';
import { toTimelineStatus } from '../../services/attendance-view';
import { formatDateRangeFromValues } from '../../utils/formatters';

interface Screen2TimelineProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen2Timeline({ onToggleView }: Screen2TimelineProps) {
  const { days: records } = useAttendance();

  const timelineDays = records.map((r) => ({
    id: r.id,
    dayLabel: r.dayLabel,
    dayOfWeek: r.dayOfWeek,
    dayNumber: r.dayNumber,
    isToday: r.isToday,
    firstInTime: r.firstInTime || undefined,
    lastOutTime: r.lastOutTime || undefined,
    workedMinutes: r.workedMinutes,
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
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-muted">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={dateRange || 'Current period'}
          viewMode="timeline"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 space-y-3.5 pt-3.5">
        {/* Shift Info & Check-in / Check-out Action Bar */}
        <AttendanceActionBar />

        {/* Main Timeline Card */}
        <TimelineTrackView days={timelineDays} />

        {/* Bottom Summary Metric Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </div>
    </div>
  );
}
