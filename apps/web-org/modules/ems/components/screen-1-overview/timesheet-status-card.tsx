import React from 'react';
import { ApprovedTimesheetNotification } from '../../types/timesheet.types';

interface TimesheetStatusCardProps {
  notification: ApprovedTimesheetNotification;
}

export function TimesheetStatusCard({ notification }: TimesheetStatusCardProps) {
  return (
    <div className="bg-[#FFFDF7] rounded-[6px] border border-amber-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        {/* Amber Clock Icon Container */}
        <div className="h-9 w-9 rounded-full bg-amber-100/90 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/60">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-850">
            Your timesheet — Timesheet ({notification.periodStart} - {notification.periodEnd}) has been approved.
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Total Hours: <span className="font-semibold text-slate-700">{notification.totalHours} Hrs, {notification.totalMinutes} Mins</span>
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
          Approved
        </span>
      </div>
    </div>
  );
}
