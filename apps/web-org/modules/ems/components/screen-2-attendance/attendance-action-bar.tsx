'use client';

import React, { useState } from 'react';
import { useAttendance } from '../../hooks/use-attendance';

export function AttendanceActionBar() {
  const { liveState, checkIn, checkOut } = useAttendance();
  const [note, setNote] = useState('');

  const handleAction = () => {
    if (liveState.isCheckedIn) {
      checkOut(note);
    } else {
      checkIn(note);
    }
    setNote('');
  };

  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-3">
      {/* Shift Badge & Timing */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-800">General Shift</span>
        <span className="text-xs text-slate-500 font-medium">[ 10:00 AM - 6:00 PM ]</span>
      </div>

      {/* Note Input & Action Button */}
      <div className="flex items-center gap-2.5 flex-1 max-w-md justify-end">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={liveState.isCheckedIn ? 'Add notes for check-out' : 'Add notes for check-in'}
          className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
        />

        <button
          onClick={handleAction}
          className={`px-3.5 py-1.5 rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
            liveState.isCheckedIn
              ? 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
              : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
          }`}
        >
          <svg className="h-3.5 w-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          <span>{liveState.isCheckedIn ? 'Check-out' : 'Check-in'}</span>
        </button>
      </div>
    </div>
  );
}
