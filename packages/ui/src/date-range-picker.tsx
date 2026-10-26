'use client';

import * as React from 'react';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from './cn';

export interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  'aria-label'?: string;
  className?: string;
  disabled?: boolean;
}

function labelFor(from: string, to: string) {
  const format = (value: string) => {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length !== 3 || parts.some((part) => !part)) return '';
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (![year, month, day].every(Number.isFinite)) return '';
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  if (!from) return 'Choose date or range';
  return to && to !== from ? `${format(from)} – ${format(to)}` : format(from);
}

/** One shared calendar for a single date or an inclusive date range. */
export function DateRangePicker({
  from,
  to,
  onChange,
  'aria-label': ariaLabel = 'Choose date or date range',
  className,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(from);
  const [draftTo, setDraftTo] = React.useState(to);

  React.useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 min-w-0 items-center gap-2 rounded-md border border-input bg-input-surface px-3 text-xs text-foreground shadow-2xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <svg
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M7.5 3v4M16.5 3v4M3.5 9h17" />
          </svg>
          <span className="truncate">{labelFor(from, to)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3" aria-label={ariaLabel}>
        <Calendar
          rangeStart={draftFrom}
          rangeEnd={draftTo}
          onRangeChange={(start, end) => {
            setDraftFrom(start);
            setDraftTo(end);
          }}
          disabled={disabled}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              setDraftFrom('');
              setDraftTo('');
              onChange('', '');
              setOpen(false);
            }}
          >
            Clear
          </button>
          <div className="flex gap-2">
            {draftFrom && (
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                onClick={() => {
                  onChange(draftFrom, draftFrom);
                  setOpen(false);
                }}
              >
                Use one day
              </button>
            )}
            <button
              type="button"
              disabled={!draftFrom || !draftTo}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              onClick={() => {
                onChange(draftFrom, draftTo);
                setOpen(false);
              }}
            >
              Apply dates
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
