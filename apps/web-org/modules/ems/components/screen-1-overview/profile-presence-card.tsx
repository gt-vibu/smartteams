import React, { useState, useEffect } from 'react';
import { EmployeeProfile } from '../../types/employee.types';
import { LivePunchState } from '../../types/attendance.types';

interface ProfilePresenceCardProps {
  employee: EmployeeProfile;
  initialPunch: LivePunchState;
}

export function ProfilePresenceCard({ employee, initialPunch }: ProfilePresenceCardProps) {
  const [isCheckedIn, setIsCheckedIn] = useState(initialPunch.isCheckedIn);
  const [seconds, setSeconds] = useState(initialPunch.currentElapsedSeconds);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isCheckedIn) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  const displaySeconds = isMounted ? seconds : 0;
  const hrs = Math.floor(displaySeconds / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((displaySeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = (displaySeconds % 60).toString().padStart(2, '0');

  return (
    <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
      {/* Avatar with Circular Border */}
      <div className="relative -mt-14 mb-3">
        <div className="h-20 w-20 rounded-full bg-slate-800 text-white font-bold text-2xl flex items-center justify-center border-4 border-white shadow-md overflow-hidden">
          {/* User photo fallback with initials */}
          <span>{employee.firstName[0]}</span>
        </div>
      </div>

      {/* Name & Role */}
      <h2 className="text-sm font-bold text-slate-900 leading-snug">
        {employee.employeeNumber} - {employee.firstName} {employee.lastName}
      </h2>
      <p className="text-xs text-slate-500 font-medium mb-3">{employee.jobTitle}</p>

      {/* Presence Status */}
      <div className="mb-2">
        <span
          className={`text-xs font-semibold ${isCheckedIn ? 'text-emerald-700' : 'text-slate-500'}`}
        >
          {isCheckedIn ? 'In' : 'Out'}
        </span>
      </div>

      {/* Ticking Clock Box (HH : MM : SS) */}
      <div className="bg-slate-50 border border-slate-200 rounded px-3 py-1.5 font-mono text-sm font-semibold text-slate-800 tracking-wider mb-3 flex items-center gap-1.5 shadow-inner">
        <span>{hrs}</span>
        <span className="text-slate-400">:</span>
        <span>{mins}</span>
        <span className="text-slate-400">:</span>
        <span>{secs}</span>
      </div>

      {/* Check-Out / Check-In Button */}
      <button
        onClick={() => setIsCheckedIn(!isCheckedIn)}
        className={`w-full py-1.5 px-4 text-xs font-semibold rounded transition-colors ${
          isCheckedIn
            ? 'border border-rose-300 text-rose-600 hover:bg-rose-50'
            : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
        }`}
      >
        {isCheckedIn ? 'Check-out' : 'Check-in'}
      </button>
    </div>
  );
}
