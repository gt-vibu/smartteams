'use client';

import React, { useState, useEffect } from 'react';
import { Button, Select, Input } from '@smarteam/ui';
import { formatSecondsToTime } from '../../utils/format.utils';
import { formatDateLabel, formatLocalIsoDate } from '../../utils/formatters';
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
          date: formatLocalIsoDate(),
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
    <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 p-3 sm:p-2.5 shadow-xs flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full min-w-0">
      {/* 1. Select Project Dropdown */}
      <div className="w-full sm:w-44">
        <Select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="Luxasia 2026">Luxasia 2026</option>
          <option value="Internal-Project 2026">Internal-Project 2026</option>
          <option value="Smarteam EMS Redesign">Smarteam EMS Redesign</option>
        </Select>
      </div>

      {/* 2. Select Job Dropdown */}
      <div className="w-full sm:w-48">
        <Select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="Development">Development</option>
          <option value="Testing">Testing</option>
          <option value="Prepare, Explore, Blueprint">Prepare, Explore, Blueprint</option>
          <option value="Deployment Cutover">Deployment Cutover</option>
          <option value="Internal Meeting">Internal Meeting</option>
          <option value="Learning and Knowledge Sharing">Learning and Knowledge Sharing</option>
        </Select>
      </div>

      {/* 3. What are you working on? Input */}
      <div className="w-full sm:flex-1 min-w-0">
        <Input
          type="text"
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          placeholder="What are you working on?"
        />
      </div>

      {/* 4. Billable Dropdown */}
      <div className="w-full sm:w-32">
        <Select value={billable} onChange={(e) => setBillable(e.target.value)}>
          <option value="Billable">Billable</option>
          <option value="Non-billable">Non-billable</option>
        </Select>
      </div>

      {/* 5. Green Timer Action Button Widget */}
      <Button
        type="button"
        variant="success"
        onClick={handleToggleTimer}
        className="w-full shrink-0 px-3.5 py-1.5 font-mono sm:w-auto"
      >
        <span>
          {hrs}:{mins}:{secs}
        </span>
        <div className="h-4 w-4 rounded-full border border-white/80 flex items-center justify-center">
          {isTimerRunning ? (
            <div className="h-1.5 w-1.5 bg-white rounded-xs" />
          ) : (
            <svg className="h-2.5 w-2.5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
      </Button>

      {/* Save Notification Toast */}
      {showSavedNotification && (
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
          ✓ Logged to {formatDateLabel(formatLocalIsoDate()) || 'today'}
        </span>
      )}
    </div>
  );
}
