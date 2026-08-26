import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import { emsStorageAdapter } from '../storage/storage.adapter';
import attendanceFixture from '../data/fixtures/attendance.json';

export interface AttendanceLiveState {
  isCheckedIn: boolean;
  checkInTimestamp: string | null; // ISO timestamp
  firstPunchInTime: string | null; // e.g. "09:43 AM"
  lastNote: string;
}

export interface AttendanceRecordItem {
  id: string;
  workDate: string;
  dayLabel: string;
  dayOfWeek: string;
  dayNumber: number;
  isToday?: boolean;
  firstInTime: string | null;
  lastOutTime: string | null;
  workedMinutes: number;
  payableHours: string;
  overtime: string;
  dayStatus: 'PRESENT' | 'HOLIDAY' | 'WEEKEND' | 'EMPTY' | 'ON_DUTY' | 'LEAVE';
  statusType: 'present' | 'weekend-present' | 'holiday' | 'weekend' | 'empty';
  holidayName?: string;
  isRestrictedHoliday?: boolean;
  shiftCode: string;
  shiftName: string;
  canRegularize: boolean;
  spanStartPercent?: number;
  spanEndPercent?: number;
}

export interface AttendancePunchItem {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  time: string;
  source: 'NATIVE' | 'REGULARIZATION' | 'SYSTEM';
}

export interface IAttendanceRepository {
  getLiveState(): AttendanceLiveState;
  getRecords(): AttendanceRecordItem[];
  getPunches(): AttendancePunchItem[];
  checkIn(note?: string): AttendanceLiveState;
  checkOut(note?: string): AttendanceLiveState;
  regularize(recordId: string, reason: string): boolean;
}

export class LocalAttendanceRepository implements IAttendanceRepository {
  getLiveState(): AttendanceLiveState {
    return emsStorageAdapter.getItem<AttendanceLiveState>(
      EMS_STORAGE_KEYS.ATTENDANCE_STATE,
      attendanceFixture.liveState as AttendanceLiveState
    );
  }

  getRecords(): AttendanceRecordItem[] {
    return emsStorageAdapter.getItem<AttendanceRecordItem[]>(
      EMS_STORAGE_KEYS.ATTENDANCE_RECORDS,
      attendanceFixture.records as AttendanceRecordItem[]
    );
  }

  getPunches(): AttendancePunchItem[] {
    return emsStorageAdapter.getItem<AttendancePunchItem[]>(
      EMS_STORAGE_KEYS.ATTENDANCE_PUNCHES,
      attendanceFixture.punches as AttendancePunchItem[]
    );
  }

  checkIn(note: string = ''): AttendanceLiveState {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateString = now.toISOString().slice(0, 10);

    const newState: AttendanceLiveState = {
      isCheckedIn: true,
      checkInTimestamp: now.toISOString(),
      firstPunchInTime: timeString,
      lastNote: note,
    };

    // Save live state
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, newState);

    // Save punch
    const punches = this.getPunches();
    const newPunch: AttendancePunchItem = {
      id: `punch_${Date.now()}`,
      date: dateString,
      type: 'IN',
      time: timeString,
      source: 'NATIVE',
    };
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_PUNCHES, [...punches, newPunch]);

    // Update today's record in records list
    const records = this.getRecords();
    const updatedRecords = records.map((r) => {
      if (r.isToday) {
        return {
          ...r,
          dayStatus: 'PRESENT' as const,
          statusType: 'present' as const,
          firstInTime: r.firstInTime || timeString,
          lastOutTime: null,
        };
      }
      return r;
    });
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, updatedRecords);

    return newState;
  }

  checkOut(note: string = ''): AttendanceLiveState {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateString = now.toISOString().slice(0, 10);

    const currentLiveState = this.getLiveState();
    let workedMinutes = 234;
    if (currentLiveState.checkInTimestamp) {
      const diffMs = now.getTime() - new Date(currentLiveState.checkInTimestamp).getTime();
      workedMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
    }

    const newState: AttendanceLiveState = {
      isCheckedIn: false,
      checkInTimestamp: null,
      firstPunchInTime: currentLiveState.firstPunchInTime || timeString,
      lastNote: note,
    };

    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, newState);

    // Save punch
    const punches = this.getPunches();
    const newPunch: AttendancePunchItem = {
      id: `punch_${Date.now()}`,
      date: dateString,
      type: 'OUT',
      time: timeString,
      source: 'NATIVE',
    };
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_PUNCHES, [...punches, newPunch]);

    // Update today's record in records list
    const records = this.getRecords();
    const updatedRecords = records.map((r) => {
      if (r.isToday) {
        return {
          ...r,
          lastOutTime: timeString,
          workedMinutes: (r.workedMinutes || 0) + workedMinutes,
        };
      }
      return r;
    });
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, updatedRecords);

    return newState;
  }

  regularize(recordId: string, _reason: string): boolean {
    const records = this.getRecords();
    const updatedRecords = records.map((r) => {
      if (r.id === recordId) {
        return {
          ...r,
          dayStatus: 'PRESENT' as const,
          statusType: 'present' as const,
          firstInTime: '10:00 AM',
          lastOutTime: '06:00 PM',
          workedMinutes: 480,
          payableHours: '08:00',
          canRegularize: false,
        };
      }
      return r;
    });
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, updatedRecords);
    return true;
  }
}

export const attendanceRepository = new LocalAttendanceRepository();
