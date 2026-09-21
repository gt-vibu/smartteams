'use client';

import * as React from 'react';
import { cn } from './cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface TimePickerProps {
  /** Forwarded to the input element so <Label htmlFor="..."> connects to it. */
  id?: string;
  'aria-label'?: string;
  /** Format: "HH:mm" in 24-hour time (e.g. "09:30", "18:00") */
  value?: string;
  onChange?: (time: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string; // "HH:mm"
  max?: string; // "HH:mm"
  /** Minute step intervals in the dropdown picker (default: 5) */
  minuteStep?: number;
}

export function TimePicker({
  id,
  'aria-label': ariaLabel,
  value = '',
  onChange,
  onBlur,
  placeholder = 'HH:mm',
  className,
  disabled = false,
  min,
  max,
  minuteStep = 5,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || '');

  // Keep local string input synced with external value
  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Parse hour and minute from value ("HH:mm")
  const { hour, minute, isValid } = React.useMemo(() => {
    if (!inputValue || typeof inputValue !== 'string') {
      return { hour: null, minute: null, isValid: false };
    }
    const parts = inputValue.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0] ?? '', 10);
      const m = parseInt(parts[1] ?? '', 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return { hour: h, minute: m, isValid: true };
      }
    }
    return { hour: null, minute: null, isValid: false };
  }, [inputValue]);

  const selectedHour = hour ?? 9;
  const selectedMinute = minute ?? 0;

  const hoursList = Array.from({ length: 24 }, (_, i) => i);
  const minutesList = React.useMemo(() => {
    const list: number[] = [];
    const step = Math.max(1, Math.min(minuteStep, 30));
    for (let i = 0; i < 60; i += step) {
      list.push(i);
    }
    if (minute !== null && !list.includes(minute)) {
      list.push(minute);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [minuteStep, minute]);

  const isTimeDisabled = React.useCallback(
    (h: number, m: number) => {
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (min && formatted < min) return true;
      if (max && formatted > max) return true;
      return false;
    },
    [min, max],
  );

  const applyTime = (h: number, m: number) => {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const formatted = `${hh}:${mm}`;
    setInputValue(formatted);
    onChange?.(formatted);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange?.(val);
  };

  const handleInputBlur = () => {
    // Format on blur if user typed single digits like "9:5" -> "09:05" or "9" -> "09:00"
    const trimmed = inputValue.trim();
    if (trimmed) {
      const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
      if (match) {
        const h = Math.min(23, Math.max(0, parseInt(match[1] ?? '0', 10)));
        const m = Math.min(59, Math.max(0, parseInt(match[2] ?? '0', 10)));
        const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        setInputValue(formatted);
        onChange?.(formatted);
      }
    }
    onBlur?.();
  };

  const handleHourSelect = (h: number) => {
    applyTime(h, selectedMinute);
  };

  const handleMinuteSelect = (m: number) => {
    applyTime(selectedHour, m);
  };

  const handleSetNow = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    applyTime(h, m);
    setOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange?.('');
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          onBlur?.();
        }
      }}
    >
      <div
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-input-surface px-3 py-1 text-xs shadow-2xs transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
          disabled && 'cursor-not-allowed opacity-50 bg-muted/40',
          className,
        )}
      >
        <input
          id={id}
          aria-label={ariaLabel}
          type="text"
          value={inputValue}
          disabled={disabled}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="w-full bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground placeholder:font-sans focus:outline-none disabled:cursor-not-allowed"
        />

        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open time picker"
            className="p-1 -mr-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        aria-label="Choose time"
        align="start"
        sideOffset={6}
        className="w-[280px] p-3 bg-card border-border shadow-xl rounded-xl z-[70]"
      >
        {/* Header Display */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">Time:</span>
            <span className="text-sm font-bold font-mono text-primary">
              {String(selectedHour).padStart(2, '0')}:{String(selectedMinute).padStart(2, '0')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({selectedHour >= 12 ? 'PM' : 'AM'})
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            {isValid ? 'Selected' : 'Pick time'}
          </div>
        </div>

        {/* Dual Scroll Columns for Hours and Minutes */}
        <div className="grid grid-cols-2 gap-2 py-2 text-center text-xs">
          {/* Hours Column */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/50 mb-1">
              Hours
            </div>
            <div className="max-h-40 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
              {hoursList.map((h) => {
                const isSelected = isValid && selectedHour === h;
                const disabledHour = isTimeDisabled(h, selectedMinute);
                const period = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 === 0 ? 12 : h % 12;

                return (
                  <button
                    key={`h-${h}`}
                    type="button"
                    disabled={disabledHour}
                    onClick={() => handleHourSelect(h)}
                    className={cn(
                      'w-full py-1 px-2 rounded-md text-xs font-mono font-medium flex items-center justify-between transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                        : 'hover:bg-muted text-foreground',
                      disabledHour && 'cursor-not-allowed opacity-25 hover:bg-transparent',
                    )}
                  >
                    <span>{String(h).padStart(2, '0')}</span>
                    <span
                      className={cn(
                        'text-[10px] opacity-70',
                        isSelected ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {h12} {period}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minutes Column */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/50 mb-1">
              Minutes
            </div>
            <div className="max-h-40 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
              {minutesList.map((m) => {
                const isSelected = isValid && selectedMinute === m;
                const disabledMinute = isTimeDisabled(selectedHour, m);

                return (
                  <button
                    key={`m-${m}`}
                    type="button"
                    disabled={disabledMinute}
                    onClick={() => handleMinuteSelect(m)}
                    className={cn(
                      'w-full py-1 px-2 rounded-md text-xs font-mono font-medium flex items-center justify-center transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                        : 'hover:bg-muted text-foreground',
                      disabledMinute && 'cursor-not-allowed opacity-25 hover:bg-transparent',
                    )}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preset Quick Chips & Actions */}
        <div className="pt-2 border-t border-border flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
            {['09:00', '13:00', '17:30', '18:30'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  const [hStr, mStr] = preset.split(':');
                  const h = parseInt(hStr ?? '0', 10);
                  const m = parseInt(mStr ?? '0', 10);
                  applyTime(h, m);
                }}
                className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-foreground text-[10px] font-mono cursor-pointer transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px]">
            <button
              type="button"
              onClick={handleSetNow}
              className="text-primary hover:underline cursor-pointer font-semibold"
            >
              Current time
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-0.5 rounded bg-primary text-primary-foreground font-medium hover:opacity-90 cursor-pointer shadow-2xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
