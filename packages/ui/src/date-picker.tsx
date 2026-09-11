'use client';

import * as React from 'react';
import { cn } from './cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerProps {
  /** Forwarded to the trigger so an associated <Label htmlFor> still moves focus here. */
  id?: string;
  'aria-label'?: string;
  value?: string; // Format: YYYY-MM-DD
  onChange?: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DatePicker({
  id,
  'aria-label': ariaLabel,
  value,
  onChange,
  placeholder = 'Select date',
  className,
  disabled = false,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse current selected date
  const selectedDate = React.useMemo(() => {
    if (!value) return null;
    const parts = value.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0] || '2026', 10);
      const m = parseInt(parts[1] || '1', 10) - 1;
      const d = parseInt(parts[2] || '1', 10);
      return new Date(y, m, d);
    }
    return null;
  }, [value]);

  const [viewDate, setViewDate] = React.useState<Date>(() => selectedDate || new Date());

  // Sync viewDate when selectedDate changes and popover opens
  React.useEffect(() => {
    if (open && selectedDate) {
      setViewDate(selectedDate);
    }
  }, [open, selectedDate]);

  const monthNames = [
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

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const formatted = `${year}-${mm}-${dd}`;
    if ((min && formatted < min) || (max && formatted > max)) return;
    onChange?.(formatted);
    setOpen(false);
  };

  // Compute days in current month & first day offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const displayFormatted = selectedDate
    ? selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={ariaLabel}
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-input-surface px-3 py-1.5 text-xs text-foreground shadow-2xs transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
            !selectedDate && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{displayFormatted}</span>
          <svg
            className="h-4 w-4 text-muted-foreground shrink-0 ml-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent
        aria-label="Choose date"
        align="start"
        sideOffset={6}
        className="w-auto p-3 bg-card border-border shadow-xl rounded-xl z-[70]"
      >
        {/* Month & Year Navigation Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Previous Month"
          >
            ←
          </button>
          <span className="font-bold text-foreground">
            {monthNames[month]} {year}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Next Month"
          >
            →
          </button>
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-[10px] font-bold text-muted-foreground uppercase">
          <span>Su</span>
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {/* Blank offset days */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <span key={`blank-${i}`} className="h-7 w-7" />
          ))}

          {/* Days of month */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isSelected =
              selectedDate &&
              selectedDate.getFullYear() === year &&
              selectedDate.getMonth() === month &&
              selectedDate.getDate() === day;

            const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isOutsideRange = Boolean((min && formatted < min) || (max && formatted > max));
            const isToday =
              new Date().getFullYear() === year &&
              new Date().getMonth() === month &&
              new Date().getDate() === day;

            return (
              <button
                key={`day-${day}`}
                type="button"
                disabled={isOutsideRange}
                onClick={() => handleSelectDay(day)}
                className={cn(
                  'h-7 w-7 rounded-md text-xs font-medium flex items-center justify-center transition-all cursor-pointer select-none',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                    : isToday
                      ? 'border border-primary text-primary font-bold'
                      : 'hover:bg-muted text-foreground',
                  isOutsideRange && 'cursor-not-allowed opacity-25 hover:bg-transparent',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Quick Actions (Today / Clear) */}
        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border text-[11px]">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const mm = String(today.getMonth() + 1).padStart(2, '0');
              const dd = String(today.getDate()).padStart(2, '0');
              const formatted = `${today.getFullYear()}-${mm}-${dd}`;
              onChange?.(formatted);
              setOpen(false);
            }}
            className="text-primary hover:underline cursor-pointer font-semibold"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              onChange?.('');
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
