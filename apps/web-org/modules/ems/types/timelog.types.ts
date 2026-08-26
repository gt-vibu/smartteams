export interface TimeLogItem {
  id: string;
  jobName: string;
  projectName: string;
  description: string;
  isBillable: boolean;
  duration: string; // "02:00"
  durationMinutes: number;
}

export type TimeLogEntry = TimeLogItem;

export interface DateGroupedTimeLogs {
  date: string; // "Aug 3, 2026"
  totalDayHours: string; // "08:00"
  entries: TimeLogItem[];
}

export interface TimeTrackerSummaryStats {
  totalHours: string; // "120:00 Hrs"
  submittedHours: string; // "00:00 Hrs"
  notSubmittedHours: string; // "120:00 Hrs"
}
