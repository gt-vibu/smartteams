export interface AttendanceTableRow {
  id: string;
  date: string; // "Sun, 23-Aug-2026"
  firstIn: string; // "11:32 AM" or "-"
  lastOut: string; // "11:32 AM" or "-"
  totalHours: string; // "08:48" or "-"
  payableHours: string; // "08:00" or "-"
  overtime: string; // "00:48" or "-"
  status: string; // "Weekend, Present", "Present", "Onam(Restricted holiday)", "Weekend"
  statusType: 'present' | 'weekend-present' | 'holiday' | 'weekend' | 'empty';
  shift: string; // "General Shift"
  canRegularize?: boolean;
  punches?: Array<{
    type: 'IN' | 'OUT';
    time: string;
    source: string;
  }>;
}
