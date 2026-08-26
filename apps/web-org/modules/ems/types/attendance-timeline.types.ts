export interface TimelineDayRecord {
  id: string;
  dayLabel: string; // "Sun 23", "Mon 24", "Today 25"
  dayOfWeek: string;
  dayNumber: number;
  isToday?: boolean;
  firstInTime?: string;
  lastOutTime?: string;
  workedMinutes: number;
  status: 'PRESENT' | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'EMPTY';
  holidayName?: string;
  isRestrictedHoliday?: boolean;
  // Visual bar span (percent of 10 AM - 6 PM scale)
  spanStartPercent?: number;
  spanEndPercent?: number;
}

export interface AttendanceSummaryStats {
  payableDays: number;
  presentDays: number;
  onDutyDays: number;
  paidLeaveDays: number;
  holidayDays: number;
  weekendDays: number;
}
