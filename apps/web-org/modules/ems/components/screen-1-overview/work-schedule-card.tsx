import React from 'react';
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
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-100">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="!text-xs !font-bold !text-slate-900 !m-0">
            Work Schedule
          </h2>
          <div className="text-[11px] text-slate-500 font-medium">
            {startDate} · {endDate}
          </div>
        </div>
      </div>

      {/* Shift Banner Bar */}
      <div className="bg-rose-50/80 border border-rose-200/70 rounded px-3 py-1.5 mb-5 flex items-center justify-between">
        <div className="text-xs font-semibold text-rose-900">
          {shift.name}
        </div>
        <div className="text-[11px] text-rose-700 font-mono font-medium">
          {shift.startsAt} - {shift.endsAt}
        </div>
      </div>

      {/* 7-Day Timeline Ruler */}
      <div className="relative pt-2 pb-1">
        {/* Horizontal Connector Line */}
        <div className="absolute top-[24px] left-6 right-6 h-0.5 bg-slate-200/80 -z-0" />

        <div className="grid grid-cols-7 gap-2 relative z-10 text-center">
          {attendanceDays.map((item) => {
            const durationStr = formatMinutesToDuration(item.workedMinutes);

            return (
              <div key={item.id} className="flex flex-col items-center">
                {/* 1. Date Hierarchy: Day of Week + Day Number */}
                <div className="flex flex-col items-center mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">
                    {item.dayOfWeek}
                  </span>
                  {item.isToday ? (
                    <span className="h-5 px-1.5 rounded-full bg-[#0284C7] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                      {item.dayNumber}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-slate-800">
                      {item.dayNumber}
                    </span>
                  )}
                </div>

                {/* Status Dot */}
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-white mb-2 shadow-xs ${
                  item.dayStatus === 'PRESENT'
                    ? 'bg-emerald-500'
                    : item.dayStatus === 'HOLIDAY'
                    ? 'bg-cyan-500'
                    : item.dayStatus === 'WEEKEND'
                    ? 'bg-amber-400'
                    : 'bg-slate-300'
                }`} />

                {/* 2. Status Hierarchy */}
                <div className="min-h-[16px] flex items-center justify-center">
                  {item.dayStatus === 'PRESENT' && (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Present
                    </span>
                  )}
                  {item.dayStatus === 'WEEKEND' && (
                    <span className="text-[11px] font-semibold text-amber-600">
                      Weekend
                    </span>
                  )}
                  {item.dayStatus === 'HOLIDAY' && (
                    <span className="text-[11px] font-semibold text-cyan-700">
                      Holiday
                    </span>
                  )}
                </div>

                {/* 3. Worked Hours Hierarchy */}
                <div className="min-h-[16px] flex items-center justify-center mt-0.5">
                  {durationStr ? (
                    <span className="text-[10px] font-mono font-medium text-slate-500">
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
  );
}
