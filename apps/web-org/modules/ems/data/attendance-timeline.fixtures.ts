import { TimelineDayRecord, AttendanceSummaryStats } from '../types/attendance-timeline.types';

export const mockTimelineDays: TimelineDayRecord[] = [
  {
    id: 'tl_sun_23',
    dayLabel: 'Sun 23',
    dayOfWeek: 'Sun',
    dayNumber: 23,
    firstInTime: '11:32 AM',
    lastOutTime: '11:32 AM',
    workedMinutes: 0,
    status: 'PRESENT',
    spanStartPercent: 18,
    spanEndPercent: 20,
  },
  {
    id: 'tl_mon_24',
    dayLabel: 'Mon 24',
    dayOfWeek: 'Mon',
    dayNumber: 24,
    firstInTime: '09:47 AM',
    lastOutTime: '06:35 PM',
    workedMinutes: 528, // 08h 48m
    status: 'PRESENT',
    spanStartPercent: 0,
    spanEndPercent: 100,
  },
  {
    id: 'tl_tue_25',
    dayLabel: 'Today 25',
    dayOfWeek: 'Tue',
    dayNumber: 25,
    isToday: true,
    firstInTime: '09:43 AM',
    workedMinutes: 233, // 03h 53m
    status: 'PRESENT',
    spanStartPercent: 0,
    spanEndPercent: 48,
  },
  {
    id: 'tl_wed_26',
    dayLabel: 'Wed 26',
    dayOfWeek: 'Wed',
    dayNumber: 26,
    workedMinutes: 0,
    status: 'HOLIDAY',
    holidayName: 'Onam (Restricted holiday)',
    isRestrictedHoliday: true,
  },
  {
    id: 'tl_thu_27',
    dayLabel: 'Thu 27',
    dayOfWeek: 'Thu',
    dayNumber: 27,
    workedMinutes: 0,
    status: 'EMPTY',
  },
  {
    id: 'tl_fri_28',
    dayLabel: 'Fri 28',
    dayOfWeek: 'Fri',
    dayNumber: 28,
    workedMinutes: 0,
    status: 'EMPTY',
  },
  {
    id: 'tl_sat_29',
    dayLabel: 'Sat 29',
    dayOfWeek: 'Sat',
    dayNumber: 29,
    workedMinutes: 0,
    status: 'WEEKEND',
  },
];

export const mockAttendanceSummaryStats: AttendanceSummaryStats = {
  payableDays: 4,
  presentDays: 2,
  onDutyDays: 0,
  paidLeaveDays: 0,
  holidayDays: 0,
  weekendDays: 2,
};
