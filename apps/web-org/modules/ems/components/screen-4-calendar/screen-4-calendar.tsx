'use client';

import React, { useState, useMemo } from 'react';
import { CalendarToolbar } from './calendar-toolbar';
import { CalendarGrid } from './calendar-grid';
import { CalendarDetailDrawer } from './calendar-detail-drawer';
import { useAttendance } from '../../hooks/use-attendance';
import { CalendarDayItem } from '../../types/calendar.types';
import holidaysFixture from '../../data/fixtures/holidays.json';

interface Screen4CalendarProps {
  onToggleView?: (view: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen4Calendar({ onToggleView }: Screen4CalendarProps = {}) {
  const { records, punches, liveState } = useAttendance();
  const [selectedDay, setSelectedDay] = useState<CalendarDayItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Generate August 2026 dynamic calendar days
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    const days: CalendarDayItem[] = [];

    // Preceding padding days from July 2026 (Sun Jul 26 - Fri Jul 31)
    const prevDays = [26, 27, 28, 29, 30, 31];
    prevDays.forEach((d) => {
      days.push({
        date: `2026-07-${d}`,
        dayNumber: d,
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    });

    // August 2026 days (Aug 1 to Aug 31)
    for (let d = 1; d <= 31; d++) {
      const dateStr = `2026-08-${String(d).padStart(2, '0')}`;
      const dayOfWeekNum = new Date(2026, 7, d).getDay(); // 0 is Sun, 6 is Sat
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
      const isToday = d === 25;

      // Find if holiday
      const holiday = holidaysFixture.holidays.find(
        (h) => h.holidayDate.startsWith(String(d).padStart(2, '0')) && h.holidayDate.includes('Aug')
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
        dayStatus = record.dayStatus as any;
        hoursLabel = record.workedMinutes > 0 ? `${Math.floor(record.workedMinutes / 60).toString().padStart(2, '0')}:${(record.workedMinutes % 60).toString().padStart(2, '0')} Hrs` : undefined;
      } else if (holiday) {
        dayStatus = 'HOLIDAY';
      } else if (isWeekend) {
        dayStatus = 'WEEKEND';
      } else if (d < 25) {
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
        punches: dayPunches.length > 0
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

    // Following padding days from Sept 2026 (Tue Sep 1 - Sat Sep 5)
    const nextDays = [1, 2, 3, 4, 5];
    nextDays.forEach((d) => {
      days.push({
        date: `2026-09-0${d}`,
        dayNumber: d,
        isCurrentMonth: false,
        dayStatus: 'EMPTY',
      });
    });

    return days;
  }, [records, punches, liveState]);

  const handleSelectDay = (day: CalendarDayItem) => {
    if (!day.isCurrentMonth) return;
    setSelectedDay(day);
    setIsDrawerOpen(true);
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Month Navigator & View Switcher — sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-[#EEF2F6]">
        <CalendarToolbar
          monthName="Aug 2026"
          onToday={() => {}}
          viewMode="calendar"
          onChangeViewMode={onToggleView}
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 pt-3 space-y-2.5">
        {/* Full Month 7-Column Calendar Grid */}
        <CalendarGrid
          days={calendarDays}
          onSelectDay={handleSelectDay}
        />
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


