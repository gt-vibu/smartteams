'use client';

import React from 'react';
import { Input, Label, TimePicker } from '@smarteam/ui';
import { HelpCircle } from 'lucide-react';

/** How hours are entered. A timer was offered too; it is not part of logging time, so it went. */
export type HoursMode = 'TOTAL' | 'START_END';

interface LogTimeHoursFieldProps {
  mode: HoursMode;
  onModeChange: (mode: HoursMode) => void;
  totalHours: string;
  onTotalHoursChange: (value: string) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  disabled: boolean;
}

/**
 * Normalizes any user-entered time or duration string into a strict HH:MM string.
 * Examples: '8' -> '08:00', '2:30' -> '02:30', '830' -> '08:30', '00:00' -> '00:00'.
 */
export function normalizeTimeInput(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || ['00:00', '0', '00', '00:', '0:0', '0:00', '00:0'].includes(trimmed)) {
    return '00:00';
  }

  const clean = trimmed.replace(/[^0-9:.]/g, '');
  if (!clean) return '00:00';

  // Handle decimal hours (e.g. 8.5 -> 08:30, 2.25 -> 02:15)
  if (clean.includes('.')) {
    const val = parseFloat(clean);
    if (!Number.isNaN(val) && val <= 24.0) {
      // Rounded as whole minutes first, so 8.999 is 09:00 rather than 08:60.
      const total = Math.round(val * 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // Handle colon format
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const h = parseInt(parts[0] || '0', 10) || 0;
    const mStr = parts[1] || '';
    let m = 0;
    if (mStr.length === 1) {
      m = (parseInt(mStr, 10) || 0) * 10;
    } else if (mStr.length >= 2) {
      m = parseInt(mStr.slice(0, 2), 10) || 0;
    }
    const clampedH = Math.min(Math.max(h, 0), 24);
    const clampedM = Math.min(Math.max(m, 0), 59);
    return `${String(clampedH).padStart(2, '0')}:${String(clampedM).padStart(2, '0')}`;
  }

  // Digits only
  const digits = clean.replace(/\D/g, '');
  if (!digits || digits === '0'.repeat(digits.length)) {
    return '00:00';
  }

  if (digits.length === 1) {
    const d = parseInt(digits, 10);
    return `${String(d).padStart(2, '0')}:00`;
  }

  if (digits.length === 2) {
    const val = parseInt(digits, 10);
    if (val <= 24 && parseInt(digits.charAt(0), 10) <= 2) {
      return `${String(val).padStart(2, '0')}:00`;
    }
    return `00:${String(Math.min(val, 59)).padStart(2, '0')}`;
  }

  if (digits.length === 3) {
    const h = parseInt(digits.charAt(0), 10);
    const m = Math.min(parseInt(digits.slice(1), 10), 59);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const h = Math.min(parseInt(digits.slice(0, 2), 10), 24);
  const m = Math.min(parseInt(digits.slice(2, 4), 10), 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The Hours row of Log Time: total hours (HH:MM) or a start and end time.
 * Matches Zoho People styling reference with radio choices and duration input.
 */
export function LogTimeHoursField({
  mode,
  onModeChange,
  totalHours,
  onTotalHoursChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  disabled,
}: LogTimeHoursFieldProps) {
  const handleHoursChange = (raw: string) => {
    let clean = raw.replace(/[^0-9:.]/g, '');
    if (!clean || ['00:00', '0', '00', '00:'].includes(clean)) {
      onTotalHoursChange('00:00');
      return;
    }

    // If typing over initial default 00:00
    if (totalHours === '00:00') {
      clean = clean.replace('00:00', '').replace('00:0', '');
    }

    if (!clean) {
      onTotalHoursChange('00:00');
      return;
    }

    // Decimal format (e.g. 2.5 or 8.5)
    if (clean.includes('.')) {
      onTotalHoursChange(clean.slice(0, 5));
      return;
    }

    // Colon format (e.g. 2:30 or 1:00)
    if (clean.includes(':')) {
      const [hPart = '', mPart = ''] = clean.split(':');
      const h = hPart.replace(/\D/g, '').slice(0, 2);
      const m = mPart.replace(/\D/g, '').slice(0, 2);
      if (!h && !m) {
        onTotalHoursChange('00:00');
        return;
      }
      onTotalHoursChange(`${h}:${m}`);
      return;
    }

    // Digits only
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 1) {
      const d = parseInt(digits, 10);
      if (d > 2) {
        onTotalHoursChange(`0${d}:`);
      } else {
        onTotalHoursChange(digits);
      }
      return;
    }
    if (digits.length === 2) {
      onTotalHoursChange(`${digits}:`);
      return;
    }
    if (digits.length === 3) {
      onTotalHoursChange(`0${digits.charAt(0)}:${digits.slice(1)}`);
      return;
    }
    onTotalHoursChange(`${digits.slice(0, 2)}:${digits.slice(2, 4)}`);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
      <Label className="text-foreground/80 font-medium pt-1 sm:col-span-1 text-xs">
        Hours <span className="text-destructive font-bold">*</span>
      </Label>
      <div className="space-y-3 sm:col-span-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-foreground">
            <input
              type="radio"
              name="hours-mode"
              checked={mode === 'TOTAL'}
              onChange={() => onModeChange('TOTAL')}
              className="text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Total hours</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-foreground">
            <input
              type="radio"
              name="hours-mode"
              checked={mode === 'START_END'}
              onChange={() => onModeChange('START_END')}
              className="text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Start and end time</span>
          </label>
        </div>

        {mode === 'TOTAL' && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9:]*"
              autoComplete="off"
              value={totalHours || '00:00'}
              onFocus={(e) => e.target.select()}
              onChange={(e) => handleHoursChange(e.target.value)}
              onBlur={() => onTotalHoursChange(normalizeTimeInput(totalHours))}
              placeholder="00:00"
              aria-label="Hours worked"
              disabled={disabled}
              className="w-24 font-mono text-xs h-8 text-center"
            />
            <span title="Enter hours in HH:MM or duration format (e.g. 08:00 or 2:30)">
              <HelpCircle className="h-4 w-4 text-amber-500/90 shrink-0 cursor-help" />
            </span>
          </div>
        )}

        {mode === 'START_END' && (
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            <div>
              <Label htmlFor="start-time" className="text-[11px] text-muted-foreground mb-1 block">
                Start time
              </Label>
              <TimePicker
                id="start-time"
                value={startTime}
                onChange={onStartTimeChange}
                disabled={disabled}
                placeholder="Start"
              />
            </div>
            <div>
              <Label htmlFor="end-time" className="text-[11px] text-muted-foreground mb-1 block">
                End time
              </Label>
              <TimePicker
                id="end-time"
                value={endTime}
                onChange={onEndTimeChange}
                disabled={disabled}
                placeholder="End"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
