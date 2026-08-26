import React from 'react';
import { CalendarDayItem } from '../../types/calendar.types';
import { CalendarDayCell } from './calendar-day-cell';

interface CalendarGridProps {
  days: CalendarDayItem[];
  onSelectDay: (day: CalendarDayItem) => void;
}

export function CalendarGrid({ days, onSelectDay }: CalendarGridProps) {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-[6px] border-t border-l border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto no-scrollbar w-full">
      <div className="min-w-[560px]">
        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-xs font-bold text-slate-700">
          {weekDays.map((wd) => (
            <div key={wd} className="py-2.5 border-r border-slate-200">
              {wd}
            </div>
          ))}
        </div>

        {/* 42 Calendar Cells Grid */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => (
            <CalendarDayCell
              key={`${day.date}-${idx}`}
              day={day}
              onClick={onSelectDay}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

