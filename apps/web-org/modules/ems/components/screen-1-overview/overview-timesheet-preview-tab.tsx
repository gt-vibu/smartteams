'use client';

import React from 'react';
import { useTimesheet } from '../../hooks/use-timesheet';

export function OverviewTimesheetPreviewTab() {
  const { summary, groupedLogs, approvedNotification } = useTimesheet();

  return (
    <div className="space-y-4">
      {/* Weekly Timesheet Status Banner */}
      <div className="bg-white rounded-[6px] border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
              Weekly Timesheet Summary
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-mono">Sprint 24 (Current Week)</span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 mt-1">
            Total Logged: {summary.totalHours}
          </h4>
          <div className="text-xs text-slate-500 mt-0.5">
            Submitted: {summary.submittedHours} · Unsubmitted: {summary.notSubmittedHours}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {approvedNotification ? (
            <span className="px-3 py-1 rounded text-xs font-bold border uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
              Status: Approved
            </span>
          ) : (
            <span className="px-3 py-1 rounded text-xs font-bold border uppercase bg-sky-50 text-sky-700 border-sky-200">
              Status: Active Log
            </span>
          )}
        </div>
      </div>

      {/* Daily Time Logs Grouped Breakdown */}
      <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800">
            Recent Work Logs & Activity Distribution
          </h4>
          <span className="text-[10px] text-slate-400">Timesheet Preview</span>
        </div>

        <div className="divide-y divide-slate-100">
          {groupedLogs.slice(0, 4).map((group) => (
            <div key={group.date} className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800">{group.date}</span>
                <span className="font-mono text-xs font-bold text-[#0284C7]">
                  {group.totalDayHours} logged
                </span>
              </div>
              <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-xs text-slate-600"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{entry.projectName}</span>
                      <span className="text-[10px] text-slate-400">· {entry.jobName}</span>
                      <span className="text-[11px] text-slate-500 italic max-w-xs truncate hidden sm:inline">
                        — {entry.description}
                      </span>
                    </div>
                    <span className="font-mono text-slate-700 font-medium shrink-0 ml-2">
                      {entry.duration}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
