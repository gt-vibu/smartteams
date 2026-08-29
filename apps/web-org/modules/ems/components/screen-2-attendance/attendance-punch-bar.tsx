import React, { useState, useEffect } from 'react';
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
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-3">
      {/* Shift Name & Hours */}
      <div className="text-xs font-bold text-slate-900 shrink-0">
        General Shift <span className="font-normal text-slate-500">[ 10:00 AM - 6:00 PM ]</span>
      </div>

      {/* Note Input */}
      <div className="flex-1 w-full max-w-md">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add notes for check-out"
          className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-colors"
        />
      </div>

      {/* Check-out Action Button with Live Timer */}
      <button
        onClick={() => setIsCheckedIn(!isCheckedIn)}
        className={`px-4 py-1.5 rounded-[4px] text-xs font-semibold flex items-center gap-2 shadow-xs transition-all shrink-0 ${
          isCheckedIn
            ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
        }`}
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
      </button>
    </div>
  );
}
