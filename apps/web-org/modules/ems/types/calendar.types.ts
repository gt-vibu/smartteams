export type CalendarDayStatus = 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'WEEKEND' | 'UPCOMING' | 'EMPTY';

export interface CalendarDayItem {
  date: string; // "2026-08-01"
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday?: boolean;
  dayStatus: CalendarDayStatus;
  hoursLabel?: string; // "08:15 Hrs"
  holidayName?: string;
  isRestrictedHoliday?: boolean;
  shiftName?: string;
  punches?: Array<{
    type: 'IN' | 'OUT';
    time: string;
    source: string;
  }>;
}

export interface MonthCalendarData {
  monthName: string; // "Aug 2026"
  year: number;
  month: number;
  days: CalendarDayItem[];
}
