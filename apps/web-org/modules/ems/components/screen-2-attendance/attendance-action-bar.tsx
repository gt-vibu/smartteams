'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { useAttendance } from '../../hooks/use-attendance';
import { useDayContext } from '../../hooks/use-day-context';

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

  // On approved leave, a holiday or a weekly off, "Not checked in" read like a missed day. The bar
  // says what today is instead, and still lets someone who is working check in.
  const { resolve, leaveByDate, holidayByDate, todayKey } = useDayContext();
  const today = resolve(todayKey);
  const dayOff =
    today === 'LEAVE'
      ? `On ${leaveByDate.get(todayKey) ?? 'leave'} today`
      : today === 'HOLIDAY'
        ? `${holidayByDate.get(todayKey)?.name ?? 'Holiday'} today`
        : today === 'WEEKEND'
          ? 'Weekly off today'
          : null;

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
                : (dayOff ?? 'Not checked in')}
        </p>
        <p className="text-[11px] text-muted-foreground" role={saveError ? 'alert' : undefined}>
          {saveError ??
            (hasNoEmployeeRecord
              ? 'This account has no employee record, so attendance cannot be recorded.'
              : !canWrite
                ? 'You do not have permission to record attendance.'
                : isSingleCompleted
                  ? 'Your attendance session for today is complete.'
                  : dayOff && !isCheckedIn && !isDayCompleted
                    ? 'Check in only if you are working today.'
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
