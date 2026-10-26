import React from 'react';
import type { CalendarDayItem } from '../../types/calendar.types';
import { CalendarDayCell } from './calendar-day-cell';

interface CalendarGridProps {
  days: CalendarDayItem[];
  onSelectDay: (day: CalendarDayItem) => void;
}

export function CalendarGrid({ days, onSelectDay }: CalendarGridProps) {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    // No minimum width: the cells carry a dot rather than a label below `sm`, so seven columns fit
    // the narrowest phone and the month no longer pans sideways inside its own scroller.
    <div className="bg-white dark:bg-card rounded-lg border-t border-l border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden w-full relative">
      <div>
        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-bold text-foreground">
          {weekDays.map((wd) => (
            <div key={wd} className="py-2.5 border-r border-border">
              {wd}
            </div>
          ))}
        </div>

        {/* 42 Calendar Cells Grid */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => (
            <CalendarDayCell key={`${day.date}-${idx}`} day={day} onClick={onSelectDay} />
          ))}
        </div>
      </div>
    </div>
  );
}
