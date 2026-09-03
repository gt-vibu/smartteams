import React from 'react';
import type { TimelineDayRecord } from '../../types/attendance-timeline.types';
import { formatMinutesToDuration } from '../../utils/format.utils';

interface TimelineTrackViewProps {
  days: TimelineDayRecord[];
}

export function TimelineTrackView({ days }: TimelineTrackViewProps) {
  const hoursScale = [
    '10 AM',
    '11 AM',
    '12 PM',
    '01 PM',
    '02 PM',
    '03 PM',
    '04 PM',
    '05 PM',
    '06 PM',
  ];

  return (
    <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden w-full overflow-x-auto relative">
      <div className="min-w-[580px] sm:min-w-[660px]">
        {/* Top Header Time Scale Ruler */}
        <div className="grid grid-cols-12 border-b border-border bg-muted/40/70 text-[11px] font-semibold text-muted-foreground py-2.5 px-4">
          {/* Left Day Header */}
          <div className="col-span-2 text-xs font-bold text-foreground">Day</div>

          {/* 9 Time Hours Markers */}
          <div className="col-span-8 grid grid-cols-9 text-center">
            {hoursScale.map((hr) => (
              <span key={hr} className="text-muted-foreground font-mono text-[10px]">
                {hr}
              </span>
            ))}
          </div>

          {/* Right Worked Hours Header */}
          <div className="col-span-2 text-right text-xs font-bold text-foreground">Total Hours</div>
        </div>

        {/* Daily Timeline Rows */}
        <div className="divide-y divide-slate-100 relative">
          {/* Vertical Current Time Guide (Dotted Line at ~1:30 PM) */}
          <div className="absolute top-0 bottom-0 left-[calc(16.666%+43.5%)] w-px border-r border-dashed border-sky-400 z-10 pointer-events-none" />

          {days.map((day) => {
            const durationStr = formatMinutesToDuration(day.workedMinutes);
            const isSameTime =
              day.firstInTime && day.lastOutTime && day.firstInTime === day.lastOutTime;

            return (
              <div
                key={day.id}
                className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                  day.isToday ? 'bg-sky-50/20' : 'hover:bg-muted/40/50'
                }`}
              >
                {/* Left Day Label Column */}
                <div className="col-span-2 flex items-center gap-2">
                  {day.isToday ? (
                    <span className="h-6 px-2 rounded-[4px] bg-primary text-white text-xs font-bold flex items-center justify-center shadow-xs">
                      {day.dayLabel}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-foreground">{day.dayLabel}</span>
                  )}
                </div>

                {/* Middle Visual Track Canvas (8 cols) */}
                <div className="col-span-8 relative flex items-center h-8 px-2">
                  {/* Background faint guide grid for shift hours */}
                  <div className="absolute inset-0 grid grid-cols-9 pointer-events-none opacity-40">
                    {hoursScale.map((_, i) => (
                      <div key={i} className="border-r border-border h-full" />
                    ))}
                  </div>

                  {/* Case 1: Present Duration Track Bar */}
                  {day.status === 'PRESENT' && (
                    <div className="w-full relative flex items-center">
                      {/* Horizontal Presence Track Line */}
                      <div className="w-full h-0.5 bg-emerald-300 relative rounded-full">
                        {/* Left Check-in Dot & Timestamp */}
                        {day.firstInTime && (
                          <div
                            className="absolute -top-1.5 flex flex-col items-center"
                            style={{ left: `${day.spanStartPercent ?? 0}%` }}
                          >
                            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs" />
                            <span className="text-[10px] font-mono font-semibold text-foreground whitespace-nowrap mt-1">
                              {day.firstInTime}
                            </span>
                          </div>
                        )}

                        {/* Right Check-out Dot & Timestamp (only if distinct) */}
                        {day.lastOutTime && !isSameTime && (
                          <div
                            className="absolute -top-1.5 flex flex-col items-center"
                            style={{ left: `${day.spanEndPercent ?? 100}%` }}
                          >
                            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500 shadow-xs" />
                            <span className="text-[10px] font-mono font-semibold text-foreground whitespace-nowrap mt-1">
                              {day.lastOutTime}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Case 2: Holiday Track Bar with Pill Tag */}
                  {day.status === 'HOLIDAY' && (
                    <div className="w-full relative flex items-center justify-center">
                      <div className="w-full h-0.5 bg-cyan-200 absolute" />
                      <span className="relative z-10 px-3 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-[11px] font-semibold shadow-xs">
                        {day.holidayName || 'Holiday'}
                      </span>
                    </div>
                  )}

                  {/* Case 3: Weekend Track Bar with Pill Tag */}
                  {day.status === 'WEEKEND' && (
                    <div className="w-full relative flex items-center justify-center">
                      <div className="w-full h-0.5 bg-amber-200 absolute" />
                      <span className="relative z-10 px-3 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold shadow-xs">
                        Weekend
                      </span>
                    </div>
                  )}

                  {/* Case 4: Empty Track */}
                  {day.status === 'EMPTY' && <div className="w-full h-0.5 bg-slate-200/60" />}
                </div>

                {/* Right Total Worked Hours Column */}
                <div className="col-span-2 text-right">
                  <div className="text-xs font-mono font-bold text-foreground">
                    {durationStr ? `${durationStr} worked` : '00:00 Hrs worked'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
