import { DailyAttendanceItem, LivePunchState } from '../types/attendance.types';

export const mockLivePunch: LivePunchState = {
  isCheckedIn: true,
  firstInTime: '09:43 AM',
  currentElapsedSeconds: 14032, // 03:53:52
};

export const mockWeekScheduleAttendance: DailyAttendanceItem[] = [
  {
    id: 'att_23',
    workDate: '2026-08-23',
    dayOfWeek: 'SUN',
    dayNumber: 23,
    dayStatus: 'PRESENT',
    workedMinutes: 0,
  },
  {
    id: 'att_24',
    workDate: '2026-08-24',
    dayOfWeek: 'MON',
    dayNumber: 24,
    dayStatus: 'PRESENT',
    workedMinutes: 528, // 08h 48m (Realistic, non-fabricated)
  },
  {
    id: 'att_25',
    workDate: '2026-08-25',
    dayOfWeek: 'TUE',
    dayNumber: 25,
    dayStatus: 'PRESENT',
    workedMinutes: 233, // 03h 53m
    isToday: true,
  },
  {
    id: 'att_26',
    workDate: '2026-08-26',
    dayOfWeek: 'WED',
    dayNumber: 26,
    dayStatus: 'HOLIDAY',
    workedMinutes: 0,
  },
  {
    id: 'att_27',
    workDate: '2026-08-27',
    dayOfWeek: 'THU',
    dayNumber: 27,
    dayStatus: 'PRESENT',
    workedMinutes: 0,
  },
  {
    id: 'att_28',
    workDate: '2026-08-28',
    dayOfWeek: 'FRI',
    dayNumber: 28,
    dayStatus: 'PRESENT',
    workedMinutes: 0,
  },
  {
    id: 'att_29',
    workDate: '2026-08-29',
    dayOfWeek: 'SAT',
    dayNumber: 29,
    dayStatus: 'WEEKEND',
    workedMinutes: 0,
  },
];
