import React from 'react';
import { ApprovedTimesheetNotification } from '../../types/timesheet.types';

interface TimesheetStatusCardProps {
  notification: ApprovedTimesheetNotification;
}

export function TimesheetStatusCard({ notification }: TimesheetStatusCardProps) {
  return (
    <div className="bg-[#FFFDF7] dark:bg-[#1B2028] rounded-lg border border-amber-200/90 dark:border-amber-500/30 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        {/* Amber Clock Icon Container */}
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-amber-100/90 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/60 dark:border-amber-700/50 mt-0.5 sm:mt-0">
          <svg
            className="h-4 w-4"
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
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800 dark:text-white break-words">
            Your timesheet — Timesheet ({notification.periodStart} - {notification.periodEnd}) has
            been approved.
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Total Hours:{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {notification.totalHours} Hrs, {notification.totalMinutes} Mins
            </span>
          </div>
        </div>
      </div>

      <div className="self-end sm:self-center shrink-0">
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-700/50">
          Approved
        </span>
      </div>
    </div>
  );
}
