'use client';

import { useState, useEffect, useCallback } from 'react';
import { timesheetRepository } from '../repositories/timesheet.repository';
import { DateGroupedTimeLogs, TimeTrackerSummaryStats } from '../types/timelog.types';

export function useTimesheet() {
  const [groupedLogs, setGroupedLogs] = useState<DateGroupedTimeLogs[]>(() =>
    timesheetRepository.getGroupedLogs(),
  );
  const [summary, setSummary] = useState<TimeTrackerSummaryStats>(() =>
    timesheetRepository.getSummary(),
  );
  const [approvedNotification, setApprovedNotification] = useState<any>(() =>
    timesheetRepository.getApprovedNotification(),
  );

  const refresh = useCallback(() => {
    setTimeout(() => {
      setGroupedLogs(timesheetRepository.getGroupedLogs());
      setSummary(timesheetRepository.getSummary());
      setApprovedNotification(timesheetRepository.getApprovedNotification());
    }, 0);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('ems:storage:change', handleStorageChange);
    window.addEventListener('ems:storage:reset', handleStorageChange);
    return () => {
      window.removeEventListener('ems:storage:change', handleStorageChange);
      window.removeEventListener('ems:storage:reset', handleStorageChange);
    };
  }, [refresh]);

  const addTimeLog = useCallback(
    (data: {
      date: string;
      projectName: string;
      jobName: string;
      description: string;
      isBillable: boolean;
      duration: string;
    }) => {
      const updated = timesheetRepository.addEntry(data);
      setGroupedLogs(updated);
      return updated;
    },
    [],
  );

  return {
    groupedLogs,
    summary,
    approvedNotification,
    addTimeLog,
    refresh,
  };
}
