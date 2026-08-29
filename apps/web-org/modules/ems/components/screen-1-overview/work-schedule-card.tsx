'use client';

import React, { useState, useEffect } from 'react';
import { DailyAttendanceItem } from '../../types/attendance.types';
import { ShiftInfo } from '../../types/shift.types';
import { formatMinutesToDuration } from '../../utils/format.utils';

interface WorkScheduleCardProps {
  shift: ShiftInfo;
  startDate: string;
  endDate: string;
  attendanceDays: DailyAttendanceItem[];
}

export function WorkScheduleCard({
  shift,
  startDate,
  endDate,
  attendanceDays,
}: WorkScheduleCardProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="bg-white dark:bg-[#1B2028] rounded-lg border border-slate-200/90 dark:border-[#262F3D] p-4 sm:p-5 shadow-xs w-full min-w-0 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 flex items-center justify-center border border-sky-100 dark:border-sky-800 shrink-0">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white m-0 truncate">
            Work Schedule
          </h2>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
            {startDate} · {endDate}
          </div>
        </div>
      </div>

      {/* Shift Banner Bar */}
      <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/60 rounded px-3 py-1.5 mb-4 sm:mb-5 flex flex-wrap items-center justify-between gap-1">
        <div className="text-xs font-semibold text-rose-900 dark:text-rose-200 truncate">
          {shift.name}
        </div>
        <div className="text-[11px] text-rose-700 dark:text-rose-300 font-mono font-medium shrink-0">
          {shift.startsAt} - {shift.endsAt}
        </div>
      </div>

      {/* 7-Day Timeline Ruler */}
      <div className="relative pt-2 pb-1 w-full overflow-x-auto no-scrollbar">
        <div className="min-w-[340px] sm:min-w-[420px] relative">
          {/* Horizontal Connector Line */}
          <div className="absolute top-[24px] left-6 right-6 h-0.5 bg-slate-200/80 dark:bg-slate-700 -z-0" />

          <div className="grid grid-cols-7 gap-2 relative z-10 text-center">
            {attendanceDays.map((item) => {
              const durationStr = isMounted ? formatMinutesToDuration(item.workedMinutes) : '';

              return (
                <div key={item.id} className="flex flex-col items-center">
                  {/* 1. Date Hierarchy: Day of Week + Day Number */}
                  <div className="flex flex-col items-center mb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-400 mb-0.5">
                      {item.dayOfWeek}
                    </span>
                    {item.isToday ? (
                      <span className="h-5 px-1.5 rounded-full bg-[#0284C7] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                        {item.dayNumber}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {item.dayNumber}
                      </span>
                    )}
                  </div>

                  {/* Status Dot */}
                  <div
                    className={`h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-800 mb-2 shadow-xs ${
                      item.dayStatus === 'PRESENT'
                        ? 'bg-emerald-500'
                        : item.dayStatus === 'HOLIDAY'
                          ? 'bg-cyan-500'
                          : item.dayStatus === 'WEEKEND'
                            ? 'bg-amber-400'
                            : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />

                  {/* 2. Status Hierarchy */}
                  <div className="min-h-[16px] flex items-center justify-center">
                    {item.dayStatus === 'PRESENT' && (
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Present
                      </span>
                    )}
                    {item.dayStatus === 'WEEKEND' && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Weekend
                      </span>
                    )}
                    {item.dayStatus === 'HOLIDAY' && (
                      <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
                        Holiday
                      </span>
                    )}
                  </div>

                  {/* 3. Worked Hours Hierarchy */}
                  <div className="min-h-[16px] flex items-center justify-center mt-0.5">
                    {durationStr ? (
                      <span className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
                        {durationStr}
                      </span>
                    ) : (
                      <span className="text-[10px] text-transparent select-none">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
