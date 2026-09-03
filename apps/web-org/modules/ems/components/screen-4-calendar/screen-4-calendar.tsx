'use client';

import React, { useState, useMemo } from 'react';
import { CalendarToolbar } from './calendar-toolbar';
import { CalendarGrid } from './calendar-grid';
import { CalendarDetailDrawer } from './calendar-detail-drawer';
import { useAttendance } from '../../hooks/use-attendance';
import { toCalendarStatus } from '../../services/attendance-view';
import type { CalendarDayItem } from '../../types/calendar.types';

interface Screen4CalendarProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen4Calendar({ onToggleView }: Screen4CalendarProps = {}) {
  const { days: records } = useAttendance();
  const [selectedDay, setSelectedDay] = useState<CalendarDayItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Open on the current month rather than a hardcoded demo month.
  const [viewDate, setViewDate] = useState(() => new Date());

  // Generate the visible month from attendance and holiday data.
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    const days: CalendarDayItem[] = [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDayOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const demoToday = records.find((record) => record.isToday)?.workDate;

    for (let offset = firstDayOffset; offset > 0; offset -= 1) {
      const date = new Date(year, month, 1 - offset);
      days.push({
        date: date.toISOString().slice(0, 10),
        dayNumber: date.getDate(),
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeekNum = new Date(year, month, d).getDay();
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
      const isToday = dateStr === demoToday;

      // Find the attendance record the server returned for this date.
      const record = records.find((r) => r.workDate === dateStr);
      const dayPunches = record?.record.punches ?? [];

      // A day with no record is EMPTY. The previous version showed "08:00 Hrs · Present" for
      // every past weekday with no data, which invented a full day of work out of nothing.
      const dayStatus: CalendarDayItem['dayStatus'] = record
        ? toCalendarStatus(record.dayStatus)
        : isWeekend
          ? 'WEEKEND'
          : demoToday && dateStr > demoToday
            ? 'UPCOMING'
            : 'EMPTY';

      days.push({
        date: dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday,
        dayStatus,
        hoursLabel: record && record.workedMinutes > 0 ? record.workedLabel : undefined,
        // Holidays and shift assignment are not wired yet, so neither is claimed here.
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
        date: date.toISOString().slice(0, 10),
        dayNumber: date.getDate(),
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    }

    return days;
  }, [records, viewDate]);

  const handleToday = () => {
    const today = records.find((record) => record.isToday)?.workDate;
    setViewDate(today ? new Date(`${today}T00:00:00`) : new Date());
  };

  const handleSelectDay = (day: CalendarDayItem) => {
    if (!day.isCurrentMonth) return;
    setSelectedDay(day);
    setIsDrawerOpen(true);
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Month Navigator & View Switcher — sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-muted">
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
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 pt-3 space-y-2.5">
        {/* Full Month 7-Column Calendar Grid */}
        <CalendarGrid days={calendarDays} onSelectDay={handleSelectDay} />
      </div>

      {/* 3. Detail Slide-In Drawer */}
      <CalendarDetailDrawer
        day={selectedDay}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
}
