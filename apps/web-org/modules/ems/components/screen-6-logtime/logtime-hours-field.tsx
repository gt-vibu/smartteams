'use client';

import React from 'react';
import { Input, Label } from '@smarteam/ui';
import { HelpCircle } from 'lucide-react';

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
 * The Hours row of Log Time: a total, or a start and an end.
 *
 * Every value starts empty and is owned by the form, which validates it on save — this only lays
 * the inputs out.
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
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
      <Label className="text-foreground/80 font-medium pt-1 sm:col-span-1 text-xs">
        Hours <span className="text-destructive font-bold">*</span>
      </Label>
      <div className="space-y-3 sm:col-span-3">
        <div className="flex items-center gap-6 pt-1">
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

        {mode === 'TOTAL' ? (
          <div className="flex items-center gap-2">
            <Input
              value={totalHours}
              onChange={(e) => onTotalHoursChange(e.target.value)}
              placeholder="e.g. 2:30"
              aria-label="Hours worked"
              disabled={disabled}
              className="w-24 font-mono text-xs h-8 text-center"
            />
            <span title="Enter hours in HH:MM or duration format">
              <HelpCircle className="h-4 w-4 text-amber-500/80 shrink-0 cursor-help" />
            </span>
          </div>
        ) : (
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
