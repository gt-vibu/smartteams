export type DayStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'WEEKEND' | 'HOLIDAY';

export interface DailyAttendanceItem {
  id: string;
  workDate: string;
  dayOfWeek: string;
  dayNumber: number;
  dayStatus: DayStatus;
  workedMinutes: number;
  isToday?: boolean;
}

export interface LivePunchState {
  isCheckedIn: boolean;
  firstInTime: string;
  currentElapsedSeconds: number;
}
