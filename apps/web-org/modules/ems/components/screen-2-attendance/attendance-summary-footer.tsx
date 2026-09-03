import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import type { AttendanceSummaryStats } from '../../types/attendance-timeline.types';

interface AttendanceSummaryFooterProps {
  stats: AttendanceSummaryStats;
  shiftName?: string;
  shiftHours?: string;
}

export function AttendanceSummaryFooter({
  stats,
  // Shift assignment is not wired; the footer says so instead of naming a shift nobody set.
  shiftName = 'Shift not recorded',
  shiftHours = '',
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
    <div className="bg-card rounded-[6px] border border-border/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Left Unit Mode Switcher & Metric Columns */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Toggle Switch */}
        <div className="flex flex-col bg-muted rounded p-0.5 border border-border text-[10px] font-bold">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setUnitMode('days')}
            className={`px-2 py-0.5 rounded transition-colors ${
              unitMode === 'days'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Days
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setUnitMode('hours')}
            className={`px-2 py-0.5 rounded transition-colors ${
              unitMode === 'hours'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Hours
          </Button>
        </div>

        {/* Metrics List */}
        <div className="flex flex-wrap items-center gap-5">
          {metrics.map((m) => (
            <div key={m.label} className={`border-l-2 ${m.color} pl-2.5`}>
              <div className="text-[10px] text-muted-foreground font-medium">{m.label}</div>
              <div className="text-xs font-bold text-foreground">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Shift Context Tag */}
      <div className="text-xs font-semibold text-foreground bg-muted/40 border border-border px-3 py-1.5 rounded shrink-0">
        {shiftName}
        {shiftHours ? (
          <span className="text-muted-foreground font-normal"> [ {shiftHours} ]</span>
        ) : null}
      </div>
    </div>
  );
}
