import type { HolidayConflictView } from '../services/holiday-conflict-view';

export interface AttendanceTableRow {
  id: string;
  date: string; // "Sun, 23-Aug-2026"
  firstIn: string; // "11:32 AM" or "-"
  lastOut: string; // "11:32 AM" or "-"
  totalHours: string; // "08:48" or "-"
  payableHours: string; // "08:00" or "-"
  overtime: string; // "00:48" or "-"
  status: string; // "Weekend, Present", "Present", "Onam(Restricted holiday)", "Weekend"
  statusType: 'present' | 'weekend-present' | 'holiday' | 'holiday-checkin' | 'weekend' | 'empty';
  /** A check-in on the employee's approved optional holiday, shown by its review state. */
  holidayConflict?: HolidayConflictView;
  shift: string; // "General Shift"
  canRegularize?: boolean;
  /** The open check-in of a past day that never had a check-out, as an ISO instant. */
  openCheckInAt?: string;
  punches?: Array<{
    type: 'IN' | 'OUT';
    time: string;
    source: string;
  }>;
}
