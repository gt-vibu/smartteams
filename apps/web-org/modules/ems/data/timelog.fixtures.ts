import timesheetsFixture from './fixtures/timesheets.json';
import type { DateGroupedTimeLogs, TimeTrackerSummaryStats } from '../types/timelog.types';

export const mockGroupedTimeLogs: DateGroupedTimeLogs[] = timesheetsFixture.groupedLogs;
export const mockTimeTrackerSummary: TimeTrackerSummaryStats = timesheetsFixture.summary;
