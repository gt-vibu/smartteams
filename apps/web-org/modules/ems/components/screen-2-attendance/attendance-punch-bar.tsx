import React, { useState, useEffect } from 'react';
import { Button, Input } from '@smarteam/ui';
import { formatSecondsToTime } from '../../utils/format.utils';

interface AttendancePunchBarProps {
  initialSeconds?: number;
}

export function AttendancePunchBar({ initialSeconds = 14242 }: AttendancePunchBarProps) {
  const [note, setNote] = useState('');
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  useEffect(() => {
    if (!isCheckedIn) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  const { hrs, mins, secs } = formatSecondsToTime(seconds);

  return (
    <div className="bg-card rounded-[6px] border border-border/90 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-3">
      {/* Shift Name & Hours */}
      <div className="text-xs font-bold text-foreground shrink-0">
        <span className="font-normal text-muted-foreground">Shift assignment is not recorded</span>
      </div>

      {/* Note Input */}
      <div className="flex-1 w-full max-w-md">
        <Input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add notes for check-out"
          className="w-full bg-muted/40 focus:bg-card"
        />
      </div>

      {/* Check-out Action Button with Live Timer */}
      <Button
        type="button"
        variant={isCheckedIn ? 'destructive' : 'success'}
        onClick={() => setIsCheckedIn(!isCheckedIn)}
        className="shrink-0 px-4 py-1.5"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {isCheckedIn ? 'Check-out' : 'Check-in'} ({hrs}:{mins}:{secs} Hrs)
        </span>
      </Button>
    </div>
  );
}
