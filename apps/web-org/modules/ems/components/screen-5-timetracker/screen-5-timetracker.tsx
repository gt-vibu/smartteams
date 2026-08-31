'use client';

import React, { useMemo, useState } from 'react';
import { TimeTrackerToolbar } from './timetracker-toolbar';
import { QuickTimerBar } from './quick-timer-bar';
import { GroupedTimeLogTable } from './grouped-timelog-table';
import { TimeLogSummaryStrip } from './timelog-summary-strip';
import { LogTimeModal } from '../screen-6-logtime/logtime-modal';
import { useTimesheet } from '../../hooks/use-timesheet';
import type { LogTimeFormData } from '../../types/logtime-form.types';

export function Screen5TimeTracker() {
  const [activeSubTab, setActiveSubTab] = useState('Time Logs');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const { groupedLogs, summary, addTimeLog } = useTimesheet();
  const monthName = useMemo(
    () => currentMonth.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
    [currentMonth],
  );

  const handleSaveLog = (data: LogTimeFormData) => {
    addTimeLog({
      date: data.date,
      projectName: data.projectName,
      jobName: data.jobName,
      description: data.description,
      isBillable: data.isBillable,
      duration: data.hours,
    });
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Sub-Tabs & Date Navigator Toolbar — sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-muted">
        <TimeTrackerToolbar
          activeSubTab={activeSubTab}
          onSelectSubTab={setActiveSubTab}
          onOpenLogTime={() => setIsModalOpen(true)}
          monthName={monthName}
          onPrevMonth={() =>
            setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))
          }
          onNextMonth={() =>
            setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))
          }
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 space-y-3 pt-3.5">
        {/* Top Quick Time Log & Live Green Timer Widget Bar */}
        <QuickTimerBar />

        {/* Date-Grouped Time Logs Table */}
        {groupedLogs.length > 0 ? (
          <GroupedTimeLogTable groupedLogs={groupedLogs} />
        ) : (
          <div className="bg-white rounded-[6px] border border-slate-200/90 p-8 text-center space-y-2 shadow-xs">
            <div className="text-sm font-bold text-slate-700">
              No time logs recorded for this period
            </div>
            <p className="text-xs text-slate-500">
              Use "Log Time" or start the quick timer above to record work hours.
            </p>
          </div>
        )}

        {/* Right-Aligned Summary KPI Strip */}
        <TimeLogSummaryStrip summary={summary} />
      </div>

      {/* Log Time Form / Modal (Screen 6) */}
      <LogTimeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLog}
      />
    </div>
  );
}
