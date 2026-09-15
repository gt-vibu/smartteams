'use client';

import React from 'react';
import { AttendanceToolbar } from './attendance-toolbar';
import { AttendanceActionBar } from './attendance-action-bar';
import { TimelineTrackView } from './timeline-track-view';
import { AttendanceSummaryFooter } from './attendance-summary-footer';
import { useAttendance } from '../../hooks/use-attendance';
import { useAttendanceWeek } from '../../hooks/use-attendance-week';
import { attendanceSummaryStats, toTimelineStatus } from '../../services/attendance-view';
import { PageShell } from '../layout/page-shell';

interface Screen2TimelineProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen2Timeline({ onToggleView }: Screen2TimelineProps) {
  const week = useAttendanceWeek();
  const { days: records, isCheckedIn, timerDisplay } = useAttendance(30, week.window);

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
        <TimelineTrackView days={timelineDays} />

        {/* Bottom Summary Metric Strip */}
        <AttendanceSummaryFooter stats={stats} />
      </PageShell>
    </div>
  );
}
