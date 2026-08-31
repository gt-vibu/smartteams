import attendanceFixture from './fixtures/attendance.json';
import type { AttendanceTableRow } from '../types/attendance-table.types';

interface AttendanceFixturePunch {
  date: string;
  type: 'IN' | 'OUT';
  time: string;
  source: string;
}

interface AttendanceFixtureRecord {
  id: string;
  workDate: string;
  dayLabel: string;
  firstInTime: string | null;
  lastOutTime: string | null;
  workedMinutes: number;
  payableHours: string;
  overtime: string;
  holidayName?: string;
  statusType: AttendanceTableRow['statusType'];
  dayStatus: string;
  shiftName: string;
  canRegularize?: boolean;
}

const attendanceRecords = attendanceFixture.records as unknown as AttendanceFixtureRecord[];
const attendancePunches = attendanceFixture.punches as unknown as AttendanceFixturePunch[];

export const mockAttendanceTableRows: AttendanceTableRow[] = attendanceRecords.map((r) => ({
  id: r.id,
  date: `${r.dayLabel}, ${r.workDate}`,
  firstIn: r.firstInTime || '-',
  lastOut: r.lastOutTime || '-',
  totalHours:
    r.workedMinutes > 0
      ? `${Math.floor(r.workedMinutes / 60)
          .toString()
          .padStart(2, '0')}:${(r.workedMinutes % 60).toString().padStart(2, '0')}`
      : '-',
  payableHours: r.payableHours,
  overtime: r.overtime,
  status:
    r.holidayName ||
    (r.statusType === 'weekend'
      ? 'Weekend'
      : r.statusType === 'weekend-present'
        ? 'Weekend, Present'
        : r.dayStatus === 'PRESENT'
          ? 'Present'
          : '-'),
  statusType: r.statusType,
  shift: r.shiftName,
  canRegularize: r.canRegularize,
  punches: attendancePunches
    .filter((p) => p.date === r.workDate)
    .map((p) => ({
      type: p.type,
      time: p.time,
      source: p.source,
    })),
}));
