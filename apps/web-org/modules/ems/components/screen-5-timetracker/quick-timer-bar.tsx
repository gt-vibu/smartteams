'use client';

import React, { useState, useEffect } from 'react';
import { formatSecondsToTime } from '../../utils/format.utils';
import { useTimesheet } from '../../hooks/use-timesheet';

export function QuickTimerBar() {
  const { addTimeLog } = useTimesheet();
  const [project, setProject] = useState('Luxasia 2026');
  const [job, setJob] = useState('Development');
  const [workDescription, setWorkDescription] = useState('');
  const [billable, setBillable] = useState('Billable');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showSavedNotification, setShowSavedNotification] = useState(false);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const { hrs, mins, secs } = formatSecondsToTime(seconds);

  const handleToggleTimer = () => {
    if (isTimerRunning) {
      // Stopping timer: if seconds >= 60, save entry
      setIsTimerRunning(false);
      if (seconds > 0) {
        const durationStr = `${hrs}:${mins}`;
        addTimeLog({
          date: 'Aug 25, 2026',
          projectName: project || 'Luxasia 2026',
          jobName: job || 'Development',
          description: workDescription || 'Quick timer work session',
          isBillable: billable === 'Billable',
          duration: durationStr === '00:00' ? '00:15' : durationStr,
        });
        setSeconds(0);
        setWorkDescription('');
        setShowSavedNotification(true);
        setTimeout(() => setShowSavedNotification(false), 2500);
      }
    } else {
      setIsTimerRunning(true);
    }
  };

  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-wrap items-center gap-2.5">
      {/* 1. Select Project Dropdown */}
      <div className="relative min-w-[150px]">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-colors appearance-none cursor-pointer"
        >
          <option value="Luxasia 2026">Luxasia 2026</option>
          <option value="Internal-Project 2026">Internal-Project 2026</option>
          <option value="Smarteam EMS Redesign">Smarteam EMS Redesign</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 2. Select Job Dropdown */}
      <div className="relative min-w-[150px]">
        <select
          value={job}
          onChange={(e) => setJob(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-colors appearance-none cursor-pointer"
        >
          <option value="Development">Development</option>
          <option value="Testing">Testing</option>
          <option value="Prepare, Explore, Blueprint">Prepare, Explore, Blueprint</option>
          <option value="Deployment Cutover">Deployment Cutover</option>
          <option value="Internal Meeting">Internal Meeting</option>
          <option value="Learning and Knowledge Sharing">Learning and Knowledge Sharing</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 3. What are you working on? Input */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          placeholder="What are you working on?"
          className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-colors"
        />
      </div>

      {/* 4. Billable Dropdown */}
      <div className="relative min-w-[110px]">
        <select
          value={billable}
          onChange={(e) => setBillable(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-colors appearance-none cursor-pointer"
        >
          <option value="Billable">Billable</option>
          <option value="Non-billable">Non-billable</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 5. Green Timer Action Button Widget */}
      <button
        onClick={handleToggleTimer}
        className="bg-[#10B981] hover:bg-[#059669] text-white px-3.5 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-2 shadow-xs transition-colors shrink-0 cursor-pointer"
      >
        <span>{hrs}:{mins}:{secs}</span>
        <div className="h-4 w-4 rounded-full border border-white/80 flex items-center justify-center">
          {isTimerRunning ? (
            <div className="h-1.5 w-1.5 bg-white rounded-xs" />
          ) : (
            <svg className="h-2.5 w-2.5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
      </button>

      {/* Save Notification Toast */}
      {showSavedNotification && (
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
          ✓ Logged to Aug 25
        </span>
      )}
    </div>
  );
}

