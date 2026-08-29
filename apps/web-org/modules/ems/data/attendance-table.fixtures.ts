import attendanceFixture from './fixtures/attendance.json';
import { AttendanceTableRow } from '../types/attendance-table.types';

export const mockAttendanceTableRows: AttendanceTableRow[] = attendanceFixture.records.map(
  (r: any) => ({
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
    punches: attendanceFixture.punches
      .filter((p: any) => p.date === r.workDate)
      .map((p: any) => ({
        type: p.type,
        time: p.time,
        source: p.source,
      })),
  }),
);
