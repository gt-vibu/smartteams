import timesheetsFixture from './fixtures/timesheets.json';
import { DateGroupedTimeLogs, TimeTrackerSummaryStats } from '../types/timelog.types';

export const mockGroupedTimeLogs: DateGroupedTimeLogs[] =
  timesheetsFixture.groupedLogs as DateGroupedTimeLogs[];
export const mockTimeTrackerSummary: TimeTrackerSummaryStats =
  timesheetsFixture.summary as TimeTrackerSummaryStats;
