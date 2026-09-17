'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { useAttendance } from '../../hooks/use-attendance';

/**
 * Check-in and check-out.
 *
 * The note field that used to sit here has been removed: `PunchDto` has no note, so anything
 * typed was discarded on submit. The shift line is gone for the same reason — shift assignment
 * is not wired, and "General Shift · 10:00 AM - 6:00 PM" was the same hardcoded string for every
 * employee regardless of their actual schedule.
 */
export function AttendanceActionBar() {
  const {
    isCheckedIn,
    isDayCompleted,
    sessionMode,
    checkIn,
    checkOut,
    saving,
    saveError,
    canWrite,
    hasNoEmployeeRecord,
  } = useAttendance();

  const isSingleCompleted = isDayCompleted && sessionMode === 'SINGLE';
  const disabled =
    saving || !canWrite || hasNoEmployeeRecord || (isSingleCompleted && !isCheckedIn);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3 shadow-xs">
      <div className="min-w-0">
        <p className="text-xs font-bold text-foreground">
          {isCheckedIn
            ? 'Checked in'
            : isSingleCompleted
              ? 'Attendance completed for today'
              : isDayCompleted
                ? 'Checked out'
                : 'Not checked in'}
        </p>
        <p className="text-[11px] text-muted-foreground" role={saveError ? 'alert' : undefined}>
          {saveError ??
            (hasNoEmployeeRecord
              ? 'This account has no employee record, so attendance cannot be recorded.'
              : !canWrite
                ? 'You do not have permission to record attendance.'
                : isSingleCompleted
                  ? 'Your attendance session for today is complete.'
                  : 'Your punches are recorded automatically.')}
        </p>
      </div>

      <Button
        className="shrink-0"
        disabled={disabled}
        onClick={() => void (isCheckedIn ? checkOut() : checkIn())}
        type="button"
        variant={isCheckedIn ? 'destructive' : isSingleCompleted ? 'outline' : 'default'}
      >
        {saving
          ? 'Recording...'
          : isCheckedIn
            ? 'Check out'
            : isSingleCompleted
              ? 'Attendance completed'
              : isDayCompleted
                ? 'Check in again'
                : 'Check in'}
      </Button>
    </div>
  );
}
