'use client';

import React, { useState, useMemo } from 'react';
import { CalendarToolbar } from './calendar-toolbar';
import { CalendarGrid } from './calendar-grid';
import { CalendarDetailDrawer } from './calendar-detail-drawer';
import { localDateKey, useAttendance } from '../../hooks/use-attendance';
import { useDayContext } from '../../hooks/use-day-context';
import type { CalendarDayItem } from '../../types/calendar.types';
import { PageShell } from '../layout/page-shell';

interface Screen4CalendarProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
  /**
   * Inside Home, under Home's own sticky tabs: the month bar scrolls with the page instead of
   * sticking, where it would slide beneath those tabs.
   */
  embedded?: boolean;
}

export function Screen4Calendar({ onToggleView, embedded = false }: Screen4CalendarProps = {}) {
  const [selectedDay, setSelectedDay] = useState<CalendarDayItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Open on the current month rather than a hardcoded demo month.
  const [viewDate, setViewDate] = useState(() => new Date());
  // Read the month being shown. The hook's default is the last thirty days, so paging back to an
  // earlier month used to show an empty calendar however much had been recorded in it.
  const monthWindow = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    return { from: localDateKey(first), to: localDateKey(last) };
  }, [viewDate]);
  const {
    days: records,
    requestCorrection,
    requestMissingCheckOut,
    explainHolidayCheckIn,
  } = useAttendance(30, monthWindow);
  // What each day was: worked, leave, holiday, weekly off, absent or still to come. The same
  // rules the Home work schedule and the attendance timeline use.
  const { resolve, holidayByDate, leaveByDate, todayKey } = useDayContext();

  // Generate the visible month from attendance and holiday data.
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    const days: CalendarDayItem[] = [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDayOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let offset = firstDayOffset; offset > 0; offset -= 1) {
      const date = new Date(year, month, 1 - offset);
      days.push({
        date: localDateKey(date),
        dayNumber: date.getDate(),
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const holidayInfo = holidayByDate.get(dateStr);
      const leaveName = leaveByDate.get(dateStr);

      // Find the attendance record the server returned for this date.
      const record = records.find((r) => r.workDate === dateStr);
      const dayPunches = record?.record.punches ?? [];

      const resolved = resolve(dateStr, record);
      const isToday = resolved === 'TODAY' || dateStr === todayKey;
      const dayStatus: CalendarDayItem['dayStatus'] =
        resolved === 'HALF_DAY' ? 'PRESENT' : resolved === 'TODAY' ? 'EMPTY' : resolved;

      days.push({
        date: dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday,
        dayStatus,
        attendanceRecordId: record?.id,
        openCheckInAt:
          !isToday && dayPunches.at(-1)?.punchType === 'IN'
            ? String(dayPunches.at(-1)?.occurredAt)
            : undefined,
        holidayName: holidayInfo?.name,
        leaveName,
        isRestrictedHoliday: holidayInfo?.isOptional,
        ...(record?.holidayConflict ? { holidayConflict: record.holidayConflict } : {}),
        hoursLabel: record && record.workedMinutes > 0 ? record.workedLabel : undefined,
        shiftName: undefined,
        punches:
          dayPunches.length > 0
            ? dayPunches.map((p) => ({
                type: p.punchType === 'IN' ? ('IN' as const) : ('OUT' as const),
                time: new Date(p.occurredAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                source: p.source ?? 'NATIVE',
              }))
            : undefined,
      });
    }

    while (days.length % 7 !== 0) {
      const date = new Date(
        year,
        month,
        daysInMonth + (days.length - firstDayOffset - daysInMonth) + 1,
      );
      days.push({
        date: localDateKey(date),
        dayNumber: date.getDate(),
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    }

    return days;
  }, [records, viewDate, holidayByDate, leaveByDate, resolve, todayKey]);

  const handleToday = () => {
    const today = records.find((record) => record.isToday)?.workDate;
    setViewDate(today ? new Date(`${today}T00:00:00`) : new Date());
  };

  const handleSelectDay = (day: CalendarDayItem) => {
    if (!day.isCurrentMonth) return;
    setSelectedDay(day);
    setIsDrawerOpen(true);
  };

  /**
   * Raises an attendance correction for the selected day.
   *
   * `requestCorrection` rejects with the API's reason, which is what keeps the drawer open and
   * shows the employee why.
   */
  const handleSubmitCorrection = async (recordId: string, reason: string) => {
    await requestCorrection(recordId, reason);
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Month Navigator & View Switcher — sticky within scroll container */}
      <div
        className={
          embedded
            ? // The page shell's width and gutters, so the bar lines up with the grid below it.
              'mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-8 [&>div]:rounded-lg [&>div]:border'
            : 'sticky top-[var(--ems-context-bar-height)] z-20 px-4 sm:px-6 bg-muted'
        }
      >
        <CalendarToolbar
          monthName={viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          onPrevMonth={() =>
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
          }
          onNextMonth={() =>
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
          }
          onToday={handleToday}
          viewMode="calendar"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <PageShell gap="tight">
        {/* Full Month 7-Column Calendar Grid */}
        <CalendarGrid days={calendarDays} onSelectDay={handleSelectDay} />
      </PageShell>

      {/* 3. Detail Slide-In Drawer */}
      <CalendarDetailDrawer
        day={selectedDay}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSubmitCorrection={handleSubmitCorrection}
        onSubmitMissingCheckOut={requestMissingCheckOut}
        onExplainHolidayCheckIn={explainHolidayCheckIn}
      />
    </div>
  );
}
