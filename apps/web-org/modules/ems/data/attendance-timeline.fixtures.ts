import attendanceFixture from './fixtures/attendance.json';
import { TimelineDayRecord, AttendanceSummaryStats } from '../types/attendance-timeline.types';

export const mockTimelineDays: TimelineDayRecord[] = attendanceFixture.records.map((r: any) => ({
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
