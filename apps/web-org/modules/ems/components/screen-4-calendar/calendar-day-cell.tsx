import React from 'react';
import { CalendarDayItem } from '../../types/calendar.types';

interface CalendarDayCellProps {
  day: CalendarDayItem;
  onClick: (day: CalendarDayItem) => void;
}

export function CalendarDayCell({ day, onClick }: CalendarDayCellProps) {
  if (!day.isCurrentMonth) {
    return (
      <div className="min-h-[72px] p-1.5 bg-slate-50/50 border-b border-r border-slate-100 opacity-40 select-none">
        <span className="text-[11px] font-medium text-slate-400">{day.dayNumber}</span>
      </div>
    );
  }

  const isWeekend = day.dayStatus === 'WEEKEND';

  return (
    <div
      onClick={() => onClick(day)}
      className={`min-h-[72px] p-1.5 border-b border-r border-slate-200 transition-all cursor-pointer group flex flex-col justify-between ${
        day.isToday
          ? 'bg-sky-50/30 ring-1 ring-inset ring-sky-300'
          : isWeekend
            ? 'bg-amber-50/20 hover:bg-amber-50/40'
            : 'bg-white hover:bg-slate-50/80'
      }`}
    >
      {/* Top Header with Day Number */}
      <div className="flex items-center justify-between">
        {day.isToday ? (
          <span className="h-5 w-5 rounded-full bg-[#0284C7] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
            {day.dayNumber}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-800 group-hover:text-[#0284C7] transition-colors">
            {day.dayNumber}
          </span>
        )}

        {day.shiftName && !isWeekend && day.dayStatus !== 'HOLIDAY' && (
          <span className="text-[9px] text-slate-400 font-medium hidden sm:inline">GEN</span>
        )}
      </div>

      {/* Center Event / Attendance Badge */}
      <div className="mt-0.5 flex flex-col gap-0.5">
        {/* Case 1: Present */}
        {day.dayStatus === 'PRESENT' && (
          <div className="p-0.5 px-1 rounded bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[9.5px] font-semibold flex items-center gap-1 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">Present {day.hoursLabel ? `· ${day.hoursLabel}` : ''}</span>
          </div>
        )}

        {/* Case 2: Holiday */}
        {day.dayStatus === 'HOLIDAY' && (
          <div className="p-0.5 px-1 rounded bg-cyan-50 border border-cyan-200/80 text-cyan-900 text-[9.5px] font-semibold flex items-center gap-1 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
            <span className="truncate">{day.holidayName}</span>
          </div>
        )}

        {/* Case 3: Weekend */}
        {isWeekend && (
          <div className="text-[9.5px] font-medium text-amber-700/80 pl-0.5">Weekend</div>
        )}
      </div>

      {/* Bottom Spacer */}
      <div className="h-0.5" />
    </div>
  );
}
