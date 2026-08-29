import attendanceFixture from './fixtures/attendance.json';
import { DailyAttendanceItem, LivePunchState } from '../types/attendance.types';

export const mockLivePunch: LivePunchState = {
  isCheckedIn: attendanceFixture.liveState.isCheckedIn,
  firstInTime: attendanceFixture.liveState.firstPunchInTime,
  currentElapsedSeconds: 14032,
};

export const mockWeekScheduleAttendance: DailyAttendanceItem[] =
  attendanceFixture.records as DailyAttendanceItem[];
