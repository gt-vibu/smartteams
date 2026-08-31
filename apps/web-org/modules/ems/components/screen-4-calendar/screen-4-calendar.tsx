'use client';

import React, { useState, useMemo } from 'react';
import { CalendarToolbar } from './calendar-toolbar';
import { CalendarGrid } from './calendar-grid';
import { CalendarDetailDrawer } from './calendar-detail-drawer';
import { useAttendance } from '../../hooks/use-attendance';
import type { CalendarDayItem } from '../../types/calendar.types';
import holidaysFixture from '../../data/fixtures/holidays.json';

interface Screen4CalendarProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen4Calendar({ onToggleView }: Screen4CalendarProps = {}) {
  const { records, punches, liveState } = useAttendance();
  const [selectedDay, setSelectedDay] = useState<CalendarDayItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(2026, 7, 1));

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
      const monthName = new Date(year, month, d).toLocaleDateString('en-US', { month: 'short' });

      const holiday = holidaysFixture.holidays.find(
        (h) =>
          h.holidayDate.startsWith(String(d).padStart(2, '0')) && h.holidayDate.includes(monthName),
      );

      // Find matching attendance record
      const record = records.find((r) => r.workDate === dateStr);
      const dayPunches = punches.filter((p) => p.date === dateStr);

      let dayStatus: CalendarDayItem['dayStatus'] = 'EMPTY';
      let hoursLabel: string | undefined = undefined;

      if (isToday) {
        dayStatus = 'PRESENT';
        hoursLabel = liveState.isCheckedIn ? 'In (Active)' : '08:00 Hrs';
      } else if (record) {
        dayStatus =
          record.dayStatus === 'ON_DUTY'
            ? 'PRESENT'
            : record.dayStatus === 'LEAVE'
              ? 'ABSENT'
              : record.dayStatus;
        hoursLabel =
          record.workedMinutes > 0
            ? `${Math.floor(record.workedMinutes / 60)
                .toString()
                .padStart(2, '0')}:${(record.workedMinutes % 60).toString().padStart(2, '0')} Hrs`
            : undefined;
      } else if (holiday) {
        dayStatus = 'HOLIDAY';
      } else if (isWeekend) {
        dayStatus = 'WEEKEND';
      } else if (demoToday && dateStr < demoToday) {
        dayStatus = 'PRESENT';
        hoursLabel = '08:00 Hrs';
      } else {
        dayStatus = 'UPCOMING';
      }

      days.push({
        date: dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday,
        dayStatus,
        hoursLabel,
        holidayName: holiday?.name || record?.holidayName,
        isRestrictedHoliday: holiday?.isOptional || record?.isRestrictedHoliday,
        shiftName: 'General Shift [ 10:00 AM - 6:00 PM ]',
        punches:
          dayPunches.length > 0
            ? dayPunches.map((p) => ({
                type: p.type,
                time: p.time,
                source: p.source,
              }))
            : isToday && liveState.firstPunchInTime
              ? [
                  {
                    type: 'IN',
                    time: liveState.firstPunchInTime,
                    source: 'NATIVE',
                  },
                ]
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
  }, [records, punches, liveState, viewDate]);

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
