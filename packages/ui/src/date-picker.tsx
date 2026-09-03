import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { useAnchoredPanel, useDismissOnOutside } from './use-anchored-panel';

const PANEL = { width: 256, height: 320 };

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
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const calendarId = React.useId();
  // Positioned in viewport coordinates and portalled, so a scrolling ancestor cannot clip it.
  const position = useAnchoredPanel(isOpen, containerRef, PANEL);

  // Escape closes and returns focus to the field, which is what a keyboard user expects and the
  // only way out of the panel without a mouse.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
      containerRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

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

  // The panel is portalled, so it has to be named alongside the trigger — otherwise clicking a
  // day counts as an outside click and closes the calendar before the click registers.
  const dismiss = React.useCallback(() => setIsOpen(false), []);
  useDismissOnOutside(isOpen, [containerRef, panelRef], dismiss);

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
        aria-label={ariaLabel}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-input-surface px-2.5 py-1 text-xs text-foreground shadow-2xs transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
          !selectedDate && 'text-muted-foreground',
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={calendarId}
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

      {/* Popover Calendar Grid, portalled out of any scrolling ancestor. */}
      {isOpen &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            id={calendarId}
            role="dialog"
            aria-label="Choose date"
            style={{ left: position.left, top: position.top, width: PANEL.width }}
            className="fixed z-[100] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xl animate-in fade-in zoom-in-95"
          >
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

                const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isOutsideRange = Boolean(
                  (min && formatted < min) || (max && formatted > max),
                );
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
                      isOutsideRange && 'cursor-not-allowed opacity-30 hover:bg-transparent',
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
                className="text-primary hover:underline cursor-pointer font-semibold"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
