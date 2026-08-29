import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import { emsStorageAdapter } from '../storage/storage.adapter';
import timesheetsFixture from '../data/fixtures/timesheets.json';
import { DateGroupedTimeLogs, TimeLogItem, TimeTrackerSummaryStats } from '../types/timelog.types';

export interface ITimesheetRepository {
  getGroupedLogs(): DateGroupedTimeLogs[];
  getSummary(): TimeTrackerSummaryStats;
  getApprovedNotification(): any;
  addEntry(data: {
    date: string;
    projectName: string;
    jobName: string;
    description: string;
    isBillable: boolean;
    duration: string;
  }): DateGroupedTimeLogs[];
}

export class LocalTimesheetRepository implements ITimesheetRepository {
  private getStoredData() {
    return emsStorageAdapter.getItem(EMS_STORAGE_KEYS.TIMESHEETS, timesheetsFixture);
  }

  getGroupedLogs(): DateGroupedTimeLogs[] {
    return this.getStoredData().groupedLogs as DateGroupedTimeLogs[];
  }

  getSummary(): TimeTrackerSummaryStats {
    return this.getStoredData().summary as TimeTrackerSummaryStats;
  }

  getApprovedNotification(): any {
    return this.getStoredData().approvedNotification;
  }

  addEntry(data: {
    date: string;
    projectName: string;
    jobName: string;
    description: string;
    isBillable: boolean;
    duration: string;
  }): DateGroupedTimeLogs[] {
    const currentData = this.getStoredData();
    const groupedLogs = [...currentData.groupedLogs];

    const newEntry: TimeLogItem = {
      id: `entry_${Date.now()}`,
      jobName: data.jobName,
      projectName: data.projectName,
      description: data.description,
      isBillable: data.isBillable,
      duration: data.duration,
      durationMinutes: 120,
    };

    // Find if date group exists
    const groupIndex = groupedLogs.findIndex((g) => g.date === data.date);
    if (groupIndex >= 0 && groupedLogs[groupIndex]) {
      const existingGroup = groupedLogs[groupIndex]!;
      groupedLogs[groupIndex] = {
        date: existingGroup.date,
        totalDayHours: existingGroup.totalDayHours,
        entries: [newEntry, ...existingGroup.entries],
      };
    } else {
      groupedLogs.unshift({
        date: data.date,
        totalDayHours: data.duration,
        entries: [newEntry],
      });
    }

    const updated = {
      ...currentData,
      groupedLogs,
    };

    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.TIMESHEETS, updated);
    return groupedLogs;
  }
}

export const timesheetRepository = new LocalTimesheetRepository();
