import React from 'react';
import { HolidayItem } from '../../types/holiday.types';

interface UpcomingHolidaysCardProps {
  holidays: HolidayItem[];
}

export function UpcomingHolidaysCard({ holidays }: UpcomingHolidaysCardProps) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-cyan-50 text-cyan-700 flex items-center justify-center border border-cyan-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <h2 className="!text-xs !font-bold !text-slate-900 !m-0">
            Upcoming Holidays
          </h2>
        </div>

        <button className="text-xs font-semibold text-[#0284C7] hover:underline">
          View all
        </button>
      </div>

      {/* 3 Holiday Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {holidays.map((hol) => (
          <div
            key={hol.id}
            className={`p-3.5 rounded-[4px] border transition-colors ${
              hol.isOptional
                ? 'border-amber-300/80 bg-amber-50/20'
                : 'border-cyan-200/80 bg-cyan-50/15'
            }`}
          >
            {/* 1. Holiday Name */}
            <div className="text-xs font-bold text-slate-900 truncate">
              {hol.name}
            </div>

            {/* 2. Holiday Classification / Type */}
            <div className="text-[11px] font-medium mt-0.5 mb-2">
              {hol.isOptional ? (
                <span className="text-amber-700 font-semibold">
                  Restricted holiday
                </span>
              ) : (
                <span className="text-cyan-700 font-medium">
                  Public holiday
                </span>
              )}
            </div>

            {/* 3. Date & Day */}
            <div className="text-[11px] font-semibold text-slate-700">
              {hol.holidayDate}, <span className="text-slate-500 font-normal">{hol.dayOfWeek}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
