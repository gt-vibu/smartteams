import React from 'react';
import type { TimeTrackerSummaryStats } from '../../types/timelog.types';

interface TimeLogSummaryStripProps {
  summary: TimeTrackerSummaryStats;
}

export function TimeLogSummaryStrip({ summary }: TimeLogSummaryStripProps) {
  return (
    <div className="bg-card rounded-[6px] border border-border/90 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-end">
      <div className="flex items-center gap-8 text-right">
        {/* Total */}
        <div className="border-l-2 border-sky-500 pl-3 text-left">
          <div className="text-xs font-mono font-bold text-sky-600">{summary.totalHours}</div>
          <div className="text-[10px] text-muted-foreground font-medium">Total</div>
        </div>

        {/* Submitted */}
        <div className="border-l-2 border-emerald-500 pl-3 text-left">
          <div className="text-xs font-mono font-bold text-emerald-600">
            {summary.submittedHours}
          </div>
          <div className="text-[10px] text-muted-foreground font-medium">Submitted</div>
        </div>

        {/* Not Submitted */}
        <div className="border-l-2 border-amber-500 pl-3 text-left flex items-center gap-2">
          <div>
            <div className="text-xs font-mono font-bold text-amber-600">
              {summary.notSubmittedHours}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">Not Submitted</div>
          </div>
          <svg
            className="h-4 w-4 text-muted-foreground ml-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
