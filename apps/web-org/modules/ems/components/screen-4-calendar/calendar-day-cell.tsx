import React from 'react';
import type { CalendarDayItem } from '../../types/calendar.types';
import { HOLIDAY_CONFLICT_PILL } from '../../services/holiday-conflict-view';

interface CalendarDayCellProps {
  day: CalendarDayItem;
  onClick: (day: CalendarDayItem) => void;
}

/**
 * One day of the month.
 *
 * On a phone a seventh of the screen is about 48px, which fits a day number and not the word
 * "Present · 8h 10m". So below `sm` the status is a coloured dot under the number — the way a
 * phone's own calendar marks a day — and the labelled badge appears from `sm` up. Tapping opens
 * the day's detail either way, so nothing the badge said is lost, only deferred a tap.
 *
 * A `button`, not a clickable `div`: the day was unreachable by keyboard and announced as nothing.
 */
export function CalendarDayCell({ day, onClick }: CalendarDayCellProps) {
  if (!day.isCurrentMonth) {
    return (
      <div className="min-h-13 select-none border-b border-r border-border bg-muted/40 p-1.5 opacity-40 sm:min-h-[72px]">
        <span className="text-[11px] font-medium text-muted-foreground">{day.dayNumber}</span>
      </div>
    );
  }

  const isWeekend = day.dayStatus === 'WEEKEND';
  // A check-in on an approved optional holiday is labelled by its review state, never "Present".
  const conflict = day.holidayConflict;
  const statusLabel = conflict
    ? `${conflict.holidayName}: ${conflict.label}`
    : day.dayStatus === 'PRESENT'
      ? `Present${day.hoursLabel ? `, ${day.hoursLabel}` : ''}`
      : day.dayStatus === 'HOLIDAY'
        ? (day.holidayName ?? 'Holiday')
        : isWeekend
          ? 'Weekend'
          : '';
  const dot = conflict
    ? conflict.tone === 'attention'
      ? 'bg-amber-500'
      : conflict.tone === 'holiday'
        ? 'bg-cyan-500'
        : 'bg-emerald-500'
    : day.dayStatus === 'PRESENT'
      ? 'bg-emerald-500'
      : day.dayStatus === 'HOLIDAY'
        ? 'bg-cyan-500'
        : isWeekend
          ? 'bg-amber-400'
          : '';

  return (
    <button
      type="button"
      onClick={() => onClick(day)}
      aria-label={`${day.date}${statusLabel ? `, ${statusLabel}` : ''}`}
      className={`group flex min-h-13 w-full min-w-0 flex-col items-center justify-between border-b border-r border-border p-1 text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[72px] sm:items-stretch sm:p-1.5 ${
        day.isToday
          ? 'bg-sky-50/30 ring-1 ring-inset ring-sky-300'
          : isWeekend
            ? 'bg-amber-50/20 hover:bg-amber-50/40'
            : 'bg-card hover:bg-muted/40'
      }`}
    >
      <div className="flex w-full items-center justify-center sm:justify-between">
        {day.isToday ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-xs sm:h-5 sm:w-5 sm:text-[11px]">
            {day.dayNumber}
          </span>
        ) : (
          <span className="text-xs font-semibold text-foreground transition-colors group-hover:text-primary sm:text-[11px]">
            {day.dayNumber}
          </span>
        )}

        {day.shiftName && !isWeekend && day.dayStatus !== 'HOLIDAY' && (
          <span className="hidden text-[9px] font-medium text-muted-foreground sm:inline">GEN</span>
        )}
      </div>

      {/* Phone: a dot. Decorative — the button's label already says what it means. */}
      {dot && (
        <span aria-hidden="true" className={`mb-1 h-1.5 w-1.5 rounded-full sm:hidden ${dot}`} />
      )}

      {/* From `sm`: the labelled badge. */}
      <div className="mt-0.5 hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
        {conflict && (
          <div
            className={`rounded border p-0.5 px-1 text-[9.5px] font-semibold shadow-2xs ${HOLIDAY_CONFLICT_PILL[conflict.tone]}`}
            title={conflict.detail}
          >
            <span className="block truncate">{conflict.holidayName}</span>
            <span className="block truncate font-medium">{conflict.label}</span>
          </div>
        )}

        {!conflict && day.dayStatus === 'PRESENT' && (
          <div className="flex items-center gap-1 rounded border border-emerald-200/80 bg-emerald-50 p-0.5 px-1 text-[9.5px] font-semibold text-emerald-800 shadow-2xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="truncate">Present {day.hoursLabel ? `· ${day.hoursLabel}` : ''}</span>
          </div>
        )}

        {day.dayStatus === 'HOLIDAY' && (
          <div className="flex items-center gap-1 rounded border border-cyan-200/80 bg-cyan-50 p-0.5 px-1 text-[9.5px] font-semibold text-cyan-900 shadow-2xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
            <span className="truncate">{day.holidayName}</span>
          </div>
        )}

        {isWeekend && (
          <div className="pl-0.5 text-[9.5px] font-medium text-amber-700/80">Weekend</div>
        )}
      </div>

      <div className="hidden h-0.5 sm:block" />
    </button>
  );
}
