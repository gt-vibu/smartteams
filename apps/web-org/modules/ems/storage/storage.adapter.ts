import { EMS_STORAGE_KEYS, EMS_STORAGE_VERSION } from './storage.keys';
import employeesFixture from '../data/fixtures/employees.json';
import attendanceFixture from '../data/fixtures/attendance.json';
import shiftsFixture from '../data/fixtures/shifts.json';
import holidaysFixture from '../data/fixtures/holidays.json';
import timesheetsFixture from '../data/fixtures/timesheets.json';
import leaveFixture from '../data/fixtures/leave.json';

class EmsStorageAdapter {
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined';
    if (this.isBrowser) {
      this.initSeed();
    }
  }

  public initSeed(forceReset = false): void {
    if (!this.isBrowser) return;

    try {
      const storedVersion = localStorage.getItem(EMS_STORAGE_KEYS.VERSION);
      if (!storedVersion || storedVersion !== EMS_STORAGE_VERSION || forceReset) {
        // Seed from JSON fixtures
        localStorage.setItem(EMS_STORAGE_KEYS.VERSION, EMS_STORAGE_VERSION);
        localStorage.setItem(EMS_STORAGE_KEYS.EMPLOYEE, JSON.stringify(employeesFixture.currentEmployee));
        localStorage.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, JSON.stringify(attendanceFixture.liveState));
        localStorage.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, JSON.stringify(attendanceFixture.records));
        localStorage.setItem(EMS_STORAGE_KEYS.ATTENDANCE_PUNCHES, JSON.stringify(attendanceFixture.punches));
        localStorage.setItem(EMS_STORAGE_KEYS.SHIFTS, JSON.stringify(shiftsFixture.shifts));
        localStorage.setItem(EMS_STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidaysFixture.holidays));
        localStorage.setItem(EMS_STORAGE_KEYS.TIMESHEETS, JSON.stringify(timesheetsFixture));
        localStorage.setItem(EMS_STORAGE_KEYS.LEAVE_BALANCES, JSON.stringify(leaveFixture.balances));
        localStorage.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, JSON.stringify(leaveFixture.applications));
      }
    } catch {
      // Ignore storage errors in restricted iframe environments
    }
  }

  public getItem<T>(key: string, fallback: T): T {
    if (!this.isBrowser) return fallback;
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  public setItem<T>(key: string, value: T): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Dispatch custom storage event for in-tab cross-component reactivity
      window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key } }));
    } catch {
      // Quota exceeded or private mode fallback
    }
  }

  public removeItem(key: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(key);
      window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key } }));
    } catch {
      // Ignore
    }
  }

  public resetToDefaults(): void {
    this.initSeed(true);
    if (this.isBrowser) {
      window.dispatchEvent(new CustomEvent('ems:storage:reset'));
    }
  }

  public seedScenario(scenario: 'fresh' | 'checked-in' | 'checked-out' | 'pending-approvals' | 'empty-state'): void {
    if (!this.isBrowser) return;
    this.setItem(EMS_STORAGE_KEYS.ACTIVE_SCENARIO, scenario);

    if (scenario === 'fresh') {
      this.resetToDefaults();
      return;
    }

    if (scenario === 'checked-in') {
      const now = Date.now();
      const threeHoursAgo = new Date(now - (3 * 3600 + 54 * 60 + 22) * 1000).toISOString();
      const liveState = {
        isCheckedIn: true,
        checkInTimestamp: threeHoursAgo,
        firstPunchInTime: '09:43 AM',
        lastNote: '',
      };
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, liveState);
      
      const records = this.getItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, attendanceFixture.records);
      const updated = records.map((r: any) => {
        if (r.isToday) {
          return {
            ...r,
            dayStatus: 'PRESENT',
            statusType: 'present',
            firstInTime: '09:43 AM',
            lastOutTime: null,
            workedMinutes: 234,
          };
        }
        return r;
      });
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, updated);
      window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key: EMS_STORAGE_KEYS.ATTENDANCE_STATE } }));
    } else if (scenario === 'checked-out') {
      const liveState = {
        isCheckedIn: false,
        checkInTimestamp: null,
        firstPunchInTime: '09:43 AM',
        lastNote: 'Completed daily sprint tasks and logged time',
      };
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, liveState);

      const records = this.getItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, attendanceFixture.records);
      const updated = records.map((r: any) => {
        if (r.isToday) {
          return {
            ...r,
            dayStatus: 'PRESENT',
            statusType: 'present',
            firstInTime: '09:43 AM',
            lastOutTime: '06:15 PM',
            workedMinutes: 512,
            payableHours: '08:00',
            overtime: '00:32',
          };
        }
        return r;
      });
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, updated);
      window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key: EMS_STORAGE_KEYS.ATTENDANCE_STATE } }));
    } else if (scenario === 'pending-approvals') {
      const pendingLeaveApp = {
        id: `app_pending_${Date.now()}`,
        leaveTypeName: 'Casual Leave',
        code: 'CL',
        startDate: '10-Sep-2026',
        endDate: '12-Sep-2026',
        dayCount: 3,
        reason: 'Family event attendance and travel.',
        approverName: '009 · Ranjith Kumar C',
        status: 'PENDING',
        appliedOn: '25-Aug-2026',
      };
      const apps = this.getItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, leaveFixture.applications);
      this.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, [pendingLeaveApp, ...apps]);

      // Set timesheet to pending
      const ts = this.getItem(EMS_STORAGE_KEYS.TIMESHEETS, timesheetsFixture);
      this.setItem(EMS_STORAGE_KEYS.TIMESHEETS, {
        ...ts,
        summary: {
          totalHours: '120:00 Hrs',
          submittedHours: '40:00 Hrs',
          notSubmittedHours: '80:00 Hrs',
        },
      });
      window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key: EMS_STORAGE_KEYS.LEAVE_APPLICATIONS } }));
    } else if (scenario === 'empty-state') {
      this.setItem(EMS_STORAGE_KEYS.TIMESHEETS, {
        summary: { totalHours: '00:00 Hrs', submittedHours: '00:00 Hrs', notSubmittedHours: '00:00 Hrs' },
        approvedNotification: null,
        groupedLogs: [],
      });
      this.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, []);
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_RECORDS, []);
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_PUNCHES, []);
      this.setItem(EMS_STORAGE_KEYS.ATTENDANCE_STATE, {
        isCheckedIn: false,
        checkInTimestamp: null,
        firstPunchInTime: null,
        lastNote: '',
      });
      window.dispatchEvent(new CustomEvent('ems:storage:reset'));
    }
  }
}

export const emsStorageAdapter = new EmsStorageAdapter();
