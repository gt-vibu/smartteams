import * as React from 'react';
import { cn } from './cn';

export interface DatePickerProps {
  value?: string; // Format: YYYY-MM-DD
  onChange?: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className,
  disabled = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Parse current selected date or fallback to today
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

  // Close calendar popover on outside click
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

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
    onChange?.(formatted);
    setIsOpen(false);
  };

  // Compute days in current month & first day offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const displayFormatted = selectedDate
    ? selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <div ref={containerRef} className={cn('relative inline-block w-full', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-2xs transition-colors hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#0284C7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-[#161B22] dark:text-slate-100 dark:hover:bg-slate-800/80 cursor-pointer',
          !selectedDate && 'text-slate-400 dark:text-slate-500',
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="truncate">{displayFormatted}</span>
        <svg
          className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Popover Calendar Grid */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-[#1B2028] dark:text-slate-100 animate-in fade-in zoom-in-95">
          {/* Month & Year Navigation Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Previous Month"
            >
              ←
            </button>
            <span className="font-bold text-slate-900 dark:text-white">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Next Month"
            >
              →
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-[10px] font-bold text-slate-400 uppercase">
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
              <span key={`blank-${i}`} className="h-6 w-6" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedDate &&
                selectedDate.getFullYear() === year &&
                selectedDate.getMonth() === month &&
                selectedDate.getDate() === day;

              const isToday =
                new Date().getFullYear() === year &&
                new Date().getMonth() === month &&
                new Date().getDate() === day;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'h-7 w-7 rounded-md text-xs font-medium flex items-center justify-center transition-all cursor-pointer select-none',
                    isSelected
                      ? 'bg-[#0284C7] text-white font-bold shadow-xs'
                      : isToday
                        ? 'border border-[#0284C7] text-[#0284C7] dark:text-sky-400 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick Actions (Today / Clear) */}
          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                onChange?.(`${today.getFullYear()}-${mm}-${dd}`);
                setIsOpen(false);
              }}
              className="text-[#0284C7] hover:underline cursor-pointer font-semibold"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange?.('');
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
