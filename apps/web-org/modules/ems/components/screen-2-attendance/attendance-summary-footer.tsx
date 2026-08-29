import React, { useState } from 'react';
import { AttendanceSummaryStats } from '../../types/attendance-timeline.types';

interface AttendanceSummaryFooterProps {
  stats: AttendanceSummaryStats;
  shiftName?: string;
  shiftHours?: string;
}

export function AttendanceSummaryFooter({
  stats,
  shiftName = 'General Shift',
  shiftHours = '10:00 AM - 6:00 PM',
}: AttendanceSummaryFooterProps) {
  const [unitMode, setUnitMode] = useState<'days' | 'hours'>('days');

  const metrics = [
    { label: 'Payable Days', value: `${stats.payableDays} Days`, color: 'border-l-sky-500' },
    { label: 'Present', value: `${stats.presentDays} Days`, color: 'border-l-emerald-500' },
    { label: 'On Duty', value: `${stats.onDutyDays} Day`, color: 'border-l-indigo-500' },
    { label: 'Paid leave', value: `${stats.paidLeaveDays} Day`, color: 'border-l-amber-500' },
    { label: 'Holidays', value: `${stats.holidayDays} Day`, color: 'border-l-cyan-500' },
    { label: 'Weekend', value: `${stats.weekendDays} Days`, color: 'border-l-amber-400' },
  ];

  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Left Unit Mode Switcher & Metric Columns */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Toggle Switch */}
        <div className="flex flex-col bg-slate-100 rounded p-0.5 border border-slate-200 text-[10px] font-bold">
          <button
            onClick={() => setUnitMode('days')}
            className={`px-2 py-0.5 rounded transition-colors ${
              unitMode === 'days'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Days
          </button>
          <button
            onClick={() => setUnitMode('hours')}
            className={`px-2 py-0.5 rounded transition-colors ${
              unitMode === 'hours'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Hours
          </button>
        </div>

        {/* Metrics List */}
        <div className="flex flex-wrap items-center gap-5">
          {metrics.map((m) => (
            <div key={m.label} className={`border-l-2 ${m.color} pl-2.5`}>
              <div className="text-[10px] text-slate-500 font-medium">{m.label}</div>
              <div className="text-xs font-bold text-slate-900">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Shift Context Tag */}
      <div className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded shrink-0">
        {shiftName} <span className="text-slate-500 font-normal">[ {shiftHours} ]</span>
      </div>
    </div>
  );
}
