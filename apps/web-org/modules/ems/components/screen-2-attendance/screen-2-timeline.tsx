'use client';

import { LoadingIndicator } from '@smarteam/ui';

import { formatDate } from '@smarteam/contracts';
import React, { useState, useMemo } from 'react';
import { AttendanceToolbar } from './attendance-toolbar';
import { AttendanceActionBar } from './attendance-action-bar';
import { TimelineTrackView } from './timeline-track-view';
import { AttendanceSummaryFooter } from './attendance-summary-footer';
import type { CorrectionTimes } from '../screen-3-attendance-table/correction-form';
import { AttendanceDetailDrawer } from '../screen-3-attendance-table/attendance-detail-drawer';
import { useAttendance } from '../../hooks/use-attendance';
import { useAttendanceWeek } from '../../hooks/use-attendance-week';
import { useMyShift } from '../../hooks/use-my-shift';
import { useDayContext } from '../../hooks/use-day-context';
import { attendanceSummaryStats } from '../../services/attendance-view';
import { datesBetween, dayParts, type ResolvedDayStatus } from '../../services/day-status';
import { timelineAxis } from '../../services/timeline-axis';
import type { TimelineDayRecord } from '../../types/attendance-timeline.types';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import { PageShell } from '../layout/page-shell';

interface Screen2TimelineProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen2Timeline({ onToggleView }: Screen2TimelineProps) {
  const week = useAttendanceWeek();
  const {
    days: records,
    loading,
    isCheckedIn,
    timerDisplay,
    requestCorrection,
    requestMissingCheckOut,
    explainHolidayCheckIn,
  } = useAttendance(30, week.window);
  const [selectedRow, setSelectedRow] = useState<AttendanceTableRow | null>(null);
  const { shift, unassigned } = useMyShift();

  const tableRows: AttendanceTableRow[] = useMemo(() => {
    return records.map((r) => {
      const dayPunches = r.record.punches ?? [];
      const openCheckInAt =
        !r.isToday && dayPunches.at(-1)?.punchType === 'IN'
          ? dayPunches.at(-1)?.occurredAt
          : undefined;
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
                : 'empty',
        dayStatus: r.dayStatus,
        isWeekend: r.isWeekend,
        holidayName: r.holidayName,
        holidayConflict: r.holidayConflict ?? undefined,
        record: r.record,
        openCheckInAt,
        shift: r.shiftName ?? 'Not recorded',
        punches: dayPunches.map((p) => ({
          type: p.punchType as 'IN' | 'OUT',
          time: new Date(p.occurredAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          source: p.source || 'NATIVE',
        })),
      };
    });
  }, [records]);

  // Every day of the week in order, not only the days with a record: a day with none still says
  // whether it was leave, a holiday, a weekly off, absent or still to come.
  const dayContext = useDayContext();
  const byDate = new Map(records.map((record) => [record.workDate, record]));
  const weekDates = datesBetween(week.window.from, week.window.to);
  const resolved = new Map(
    weekDates.map((dateKey) => [dateKey, dayContext.resolve(dateKey, byDate.get(dateKey))]),
  );
  const trackStatus = (status: ResolvedDayStatus | undefined): TimelineDayRecord['status'] =>
    status === 'PRESENT' || status === 'HALF_DAY'
      ? 'PRESENT'
      : status === 'LEAVE' ||
          status === 'HOLIDAY' ||
          status === 'WEEKEND' ||
          status === 'ABSENT' ||
          status === 'UPCOMING'
        ? status
        : 'EMPTY';

  const timelineDays: TimelineDayRecord[] = weekDates.map((dateKey) => {
    const r = byDate.get(dateKey);
    const status = trackStatus(resolved.get(dateKey));
    const leaveName = dayContext.leaveByDate.get(dateKey);
    const holidayName = r?.holidayName ?? dayContext.holidayByDate.get(dateKey)?.name;
    if (!r) {
      const { dayOfWeek, dayNumber } = dayParts(dateKey);
      return {
        id: `day-${dateKey}`,
        dayLabel: formatDate(dateKey).split(' ').slice(0, 2).join(' '),
        dayOfWeek,
        dayNumber,
        isToday: dateKey === dayContext.todayKey,
        workedMinutes: 0,
        status,
        ...(leaveName ? { leaveName } : {}),
        ...(holidayName ? { holidayName } : {}),
      };
    }
    return {
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
      status,
      ...(leaveName ? { leaveName } : {}),
      ...(holidayName ? { holidayName } : {}),
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
    };
  });

  // The ruler spans the shift with room either side, widened to fit any punch this week.
  const axis = timelineAxis(
    shift,
    records.flatMap((r) =>
      [r.spanStartPercent, r.spanEndPercent].filter((value): value is number => value != null),
    ),
  );

  // Leave, holidays and weekly offs are counted from the whole week, not only recorded days.
  const counted = [...resolved.values()];
  const stats = {
    ...attendanceSummaryStats(records),
    leaveDays: counted.filter((status) => status === 'LEAVE').length,
    holidayDays: counted.filter((status) => status === 'HOLIDAY').length,
    weekendDays: counted.filter((status) => status === 'WEEKEND').length,
  };

  // The form shows it was sent, then closes the drawer itself.
  const handleRegularize = (recordId: string, reason: string, times?: CorrectionTimes) =>
    requestCorrection(recordId, reason, times);

  return (
    <div className="w-full flex flex-col">
      {/* 1. Header Toolbar — sticky within scroll container */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 px-4 sm:px-6 bg-muted">
        <AttendanceToolbar
          title="Attendance Summary"
          dateRange={week.label}
          onPrevDate={week.previous}
          onNextDate={week.next}
          dateWindow={week.window}
          onSelectRange={week.selectRange}
          viewMode="timeline"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <PageShell gap="tight">
        {/* Shift Info & Check-in / Check-out Action Bar */}
        <AttendanceActionBar />

        {/* Until the week has loaded, say so: an empty grid over "0 Days" read as no attendance. */}
        {loading && records.length === 0 ? (
          <LoadingIndicator variant="panel" label="Loading attendance" className="rounded-lg border border-border bg-card py-10 text-center text-xs text-muted-foreground" />
        ) : (
          <>
            {/* Main Timeline Card */}
            <TimelineTrackView
              axis={axis}
              days={timelineDays}
              onSelectDay={(dayId) => {
                const found = tableRows.find((row) => row.id === dayId);
                if (found) setSelectedRow(found);
              }}
            />

            {/* Bottom Summary Metric Strip */}
            <AttendanceSummaryFooter
              shiftHours={shift ? `${shift.startsAt} – ${shift.endsAt}` : ''}
              shiftName={shift?.name ?? (unassigned ? 'No shift assigned' : undefined)}
              stats={stats}
            />
          </>
        )}
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
