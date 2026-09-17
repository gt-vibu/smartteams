'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { HelpCircle, Play, Pause, RotateCcw } from 'lucide-react';

export type HoursMode = 'TOTAL' | 'START_END' | 'TIMER';

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
    try {
      const val = parseFloat(clean);
      if (!Number.isNaN(val) && val <= 24.0) {
        const h = Math.floor(val);
        const m = Math.round((val - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    } catch {
      // Fall through to standard parsing
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
 * The Hours row of Log Time: Total hours (with 00:00 format), Start and end time, or Timer.
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
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

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

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          const next = prev + 1;
          const hrs = Math.floor(next / 3600);
          const mins = Math.floor((next % 3600) / 60);
          onTotalHoursChange(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, onTotalHoursChange]);

  const formatTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
    onTotalHoursChange('00:00');
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
          <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-foreground">
            <input
              type="radio"
              name="hours-mode"
              checked={mode === 'TIMER'}
              onChange={() => onModeChange('TIMER')}
              className="text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Timer</span>
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

        {mode === 'TIMER' && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center rounded border border-border bg-muted/20 px-3 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
              <span>{formatTimer(timerSeconds)}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant={isTimerRunning ? 'destructive' : 'default'}
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              disabled={disabled}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              {isTimerRunning ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>{isTimerRunning ? 'Pause' : 'Start'}</span>
            </Button>
            {timerSeconds > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleResetTimer}
                disabled={disabled}
                className="h-8 text-xs gap-1 cursor-pointer"
                title="Reset timer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>
            )}
            <span title="Timer tracks duration and logs elapsed time in HH:MM format">
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
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
                disabled={disabled}
                className="font-mono text-xs h-8"
              />
            </div>
            <div>
              <Label htmlFor="end-time" className="text-[11px] text-muted-foreground mb-1 block">
                End time
              </Label>
              <Input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
                disabled={disabled}
                className="font-mono text-xs h-8"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
