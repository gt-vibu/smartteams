'use client';

import * as React from 'react';
import { cn } from './cn';

export interface CalendarProps {
  className?: string;
  value?: string; // YYYY-MM-DD
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Range selection support */
  rangeStart?: string;
  rangeEnd?: string;
  onRangeChange?: (start: string, end: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * shadcn-inspired Calendar component with dark-mode support, month/year navigation,
 * single-date and range selection, and quick actions.
 */
export function Calendar({
  className,
  value,
  onChange,
  min,
  max,
  disabled = false,
  rangeStart,
  rangeEnd,
  onRangeChange,
}: CalendarProps) {
  // Parse initial view date
  const parsedDate = React.useMemo(() => {
    const target = value || rangeStart;
    if (!target) return null;
    const parts = target.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0] || '2026', 10);
      const m = parseInt(parts[1] || '1', 10) - 1;
      const d = parseInt(parts[2] || '1', 10);
      return new Date(y, m, d);
    }
    return null;
  }, [value, rangeStart]);

  const [viewDate, setViewDate] = React.useState<Date>(() => parsedDate || new Date());

  React.useEffect(() => {
    if (parsedDate) {
      setViewDate(parsedDate);
    }
  }, [parsedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const todayStr = React.useMemo(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }, []);

  const handleSelectDay = (day: number) => {
    if (disabled) return;
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const formatted = `${year}-${mm}-${dd}`;

    if ((min && formatted < min) || (max && formatted > max)) return;

    if (onRangeChange) {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        onRangeChange(formatted, '');
      } else if (rangeStart && !rangeEnd) {
        if (formatted < rangeStart) {
          onRangeChange(formatted, rangeStart);
        } else {
          onRangeChange(rangeStart, formatted);
        }
      }
    } else {
      onChange?.(formatted);
    }
  };

  return (
    <div
      className={cn(
        'w-[260px] select-none rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg',
        className,
      )}
    >
      {/* Header: Month & Year + Controls */}
      <div className="flex items-center justify-between pb-2 border-b border-border/80 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={handlePrevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
          aria-label="Previous month"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-semibold text-sm text-foreground">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={handleNextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
          aria-label="Next month"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 gap-1 pt-2.5 pb-1 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {WEEKDAY_NAMES.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {/* Blank offset days */}
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <span key={`blank-${i}`} className="h-7 w-7" />
        ))}

        {/* Days of current month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const mm = String(month + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const formatted = `${year}-${mm}-${dd}`;

          const isSelected =
            value === formatted || rangeStart === formatted || rangeEnd === formatted;
          const isInRange = Boolean(
            rangeStart && rangeEnd && formatted > rangeStart && formatted < rangeEnd,
          );
          const isToday = formatted === todayStr;
          const isOutsideRange = Boolean((min && formatted < min) || (max && formatted > max));

          return (
            <button
              key={`day-${day}`}
              type="button"
              disabled={disabled || isOutsideRange}
              onClick={() => handleSelectDay(day)}
              className={cn(
                'h-7 w-7 rounded-md text-xs font-medium flex items-center justify-center transition-all cursor-pointer select-none',
                isSelected
                  ? 'bg-primary text-primary-foreground font-bold shadow-xs hover:bg-primary/90'
                  : isInRange
                    ? 'bg-primary/15 text-primary font-medium rounded-none'
                    : isToday
                      ? 'border border-primary text-primary font-bold hover:bg-primary/10'
                      : 'hover:bg-muted text-foreground',
                isOutsideRange &&
                  'cursor-not-allowed opacity-30 hover:bg-transparent pointer-events-none',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Quick Actions (Today / Clear) */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/80 text-[11px]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (onRangeChange) {
              onRangeChange(todayStr, '');
            } else {
              onChange?.(todayStr);
            }
          }}
          className="font-medium text-primary hover:underline cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (onRangeChange) {
              onRangeChange('', '');
            } else {
              onChange?.('');
            }
          }}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
