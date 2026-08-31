import attendanceFixture from './fixtures/attendance.json';
import type { TimelineDayRecord, AttendanceSummaryStats } from '../types/attendance-timeline.types';

const attendanceRecords = attendanceFixture.records as unknown as Array<{
  id: string;
  dayLabel: string;
  dayOfWeek: string;
  dayNumber: number;
  isToday?: boolean;
  firstInTime?: string;
  lastOutTime?: string;
  workedMinutes: number;
  dayStatus: TimelineDayRecord['status'];
  spanStartPercent?: number;
  spanEndPercent?: number;
  holidayName?: string;
  isRestrictedHoliday?: boolean;
}>;

export const mockTimelineDays: TimelineDayRecord[] = attendanceRecords.map((r) => ({
  id: r.id,
  dayLabel: r.dayLabel,
  dayOfWeek: r.dayOfWeek,
  dayNumber: r.dayNumber,
  isToday: r.isToday,
  firstInTime: r.firstInTime,
  lastOutTime: r.lastOutTime,
  workedMinutes: r.workedMinutes,
  status: r.dayStatus,
  spanStartPercent: r.spanStartPercent || 0,
  spanEndPercent: r.spanEndPercent || 0,
  holidayName: r.holidayName,
  isRestrictedHoliday: r.isRestrictedHoliday,
}));

export const mockAttendanceSummaryStats: AttendanceSummaryStats = {
  payableDays: 4,
  presentDays: 2,
  onDutyDays: 0,
  paidLeaveDays: 0,
  holidayDays: 0,
  weekendDays: 2,
};
