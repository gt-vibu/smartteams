'use client';

import React from 'react';
import { useEmployee } from '../../hooks/use-employee';
import { useTimesheet } from '../../hooks/use-timesheet';

export function GreetingActivityCard() {
  const { employee } = useEmployee();
  const { approvedNotification } = useTimesheet();

  return (
    <div className="space-y-3">
      {/* Greeting Banner */}
      <div className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="h-9 w-9 rounded-md bg-[#0284C7] flex items-center justify-center text-white font-bold text-sm shadow-xs">
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              smarteam
            </div>
            <h2 className="!text-sm !font-bold !text-slate-800 !m-0">
              Good Afternoon {employee.firstName} {employee.lastName}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Have a productive day!</p>
          </div>
        </div>
      </div>

      {/* Timesheet Approval Notice */}
      {approvedNotification && (
        <div className="bg-white rounded-[6px] border border-slate-200/90 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
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
          <div className="text-xs">
            <div className="text-slate-700">
              Your timesheet —{' '}
              <strong className="text-slate-900 font-semibold">
                Timesheet ({approvedNotification.periodStart} - {approvedNotification.periodEnd})
              </strong>{' '}
              has been approved.
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              Total Hours: {approvedNotification.totalHours} Hrs,{' '}
              {approvedNotification.totalMinutes} Mins
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
