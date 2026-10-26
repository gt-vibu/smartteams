'use client';

import React from 'react';
import { formatMinutes } from '@smarteam/contracts';
import type { ShiftInfo } from '../../types/shift.types';
import { dayStatusLabel, type ResolvedDayStatus } from '../../services/day-status';

/** One day of the week on the Home schedule, already resolved to what it was. */
export type ScheduleDay = {
  dateKey: string;
  dayOfWeek: string;
  dayNumber: number;
  status: ResolvedDayStatus;
  workedMinutes: number;
  isToday: boolean;
  leaveName?: string | null;
  holidayName?: string | null;
};

interface WorkScheduleCardProps {
  /** Today's assigned shift; null when none is assigned or it has not loaded yet. */
  shift: ShiftInfo | null;
  /** What the banner says when there is no shift: still loading, none assigned, or unreadable. */
  shiftStatus?: 'loading' | 'unassigned' | 'unavailable';
  startDate: string;
  endDate: string;
  /** This week, Monday to Sunday, oldest first. */
  attendanceDays: ScheduleDay[];
}

const DOT: Record<ResolvedDayStatus, string> = {
  PRESENT: 'bg-emerald-500',
  HALF_DAY: 'bg-emerald-300',
  LEAVE: 'bg-violet-500',
  HOLIDAY: 'bg-cyan-500',
  WEEKEND: 'bg-amber-400',
  ABSENT: 'bg-rose-500',
  TODAY: 'bg-primary',
  UPCOMING: 'bg-slate-200 dark:bg-slate-700',
  EMPTY: 'bg-slate-300 dark:bg-slate-600',
};

const WORD: Record<ResolvedDayStatus, string> = {
  PRESENT: 'text-emerald-700 dark:text-emerald-400',
  HALF_DAY: 'text-emerald-700 dark:text-emerald-400',
  LEAVE: 'text-violet-700 dark:text-violet-300',
  HOLIDAY: 'text-cyan-700 dark:text-cyan-400',
  WEEKEND: 'text-amber-600 dark:text-amber-400',
  ABSENT: 'text-rose-600 dark:text-rose-400',
  TODAY: 'text-foreground',
  UPCOMING: 'text-muted-foreground',
  EMPTY: 'text-muted-foreground',
};

export function WorkScheduleCard({
  shift,
  shiftStatus = 'unassigned',
  startDate,
  endDate,
  attendanceDays,
}: WorkScheduleCardProps) {
  return (
    <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-border p-4 sm:p-5 shadow-xs w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 flex items-center justify-center border border-sky-100 dark:border-sky-800 shrink-0">
          <svg
            aria-hidden="true"
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
            Work schedule
          </h2>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
            {endDate ? `${startDate} – ${endDate}` : startDate}
          </div>
        </div>
      </div>

      {/* Today's shift, from the employee's assignment. A missing one is stated plainly, not as
          an error: many organizations do not use shifts at all. */}
      {shift ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-1 rounded border border-sky-200/70 bg-sky-50/80 px-3 py-1.5 dark:border-sky-800/60 dark:bg-sky-950/40 sm:mb-5">
          <div className="truncate text-xs font-semibold text-sky-900 dark:text-sky-200">
            {shift.name}
          </div>
          <div className="shrink-0 text-[11px] font-medium tabular-nums text-sky-700 dark:text-sky-300">
            {shift.startsAt} - {shift.endsAt}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:mb-5">
          {shiftStatus === 'loading'
            ? 'Loading shift…'
            : shiftStatus === 'unavailable'
              ? 'Shift could not be loaded'
              : 'No shift assigned for today'}
        </div>
      )}

      {/* The week left to right, one column a day. On a phone each column is about 36px, so the
          status word gives way to the coloured dot below `sm` rather than spilling over. */}
      <div className="relative pt-2 pb-1 w-full">
        <div className="absolute top-[32px] left-6 right-6 h-0.5 bg-slate-200/80 dark:bg-slate-700" />
        <ol className="relative z-10 grid grid-cols-7 gap-1 sm:gap-2 text-center">
          {attendanceDays.map((day) => {
            const label = dayStatusLabel(day.status, day);
            const hours =
              day.workedMinutes > 0 && (day.status === 'PRESENT' || day.status === 'HALF_DAY')
                ? formatMinutes(day.workedMinutes)
                : '';
            return (
              <li
                key={day.dateKey}
                aria-label={[day.dayOfWeek, day.dayNumber, label, hours].filter(Boolean).join(' ')}
                className="flex min-w-0 flex-col items-center"
              >
                <span className="text-[10px] font-semibold tracking-wide text-slate-400 mb-0.5">
                  {day.dayOfWeek}
                </span>
                {day.isToday ? (
                  <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                    {day.dayNumber}
                  </span>
                ) : (
                  <span className="h-5 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center">
                    {day.dayNumber}
                  </span>
                )}
                <span
                  className={`mt-2 mb-2 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-card ${DOT[day.status]}`}
                />
                <span
                  className={`hidden min-h-[16px] max-w-full truncate px-0.5 text-[11px] font-semibold sm:block ${WORD[day.status]}`}
                  title={label}
                >
                  {label}
                </span>
                <span className="min-h-[16px] whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {hours}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
