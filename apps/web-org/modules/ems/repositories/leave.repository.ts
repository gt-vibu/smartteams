import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import { emsStorageAdapter } from '../storage/storage.adapter';
import leaveFixture from '../data/fixtures/leave.json';
import type {
  LeaveBalanceItem,
  LeaveApplicationItem,
  ApplyLeaveFormData,
} from '../types/leave.types';

export interface ILeaveRepository {
  getBalances(): LeaveBalanceItem[];
  getApplications(): LeaveApplicationItem[];
  applyLeave(data: ApplyLeaveFormData): LeaveApplicationItem[];
  approveApplication(id: string): LeaveApplicationItem[];
  rejectApplication(id: string): LeaveApplicationItem[];
}

export class LocalLeaveRepository implements ILeaveRepository {
  getBalances(): LeaveBalanceItem[] {
    return emsStorageAdapter.getItem<LeaveBalanceItem[]>(
      EMS_STORAGE_KEYS.LEAVE_BALANCES,
      leaveFixture.balances,
    );
  }

  getApplications(): LeaveApplicationItem[] {
    return emsStorageAdapter.getItem<LeaveApplicationItem[]>(
      EMS_STORAGE_KEYS.LEAVE_APPLICATIONS,
      leaveFixture.applications as LeaveApplicationItem[],
    );
  }

  applyLeave(data: ApplyLeaveFormData): LeaveApplicationItem[] {
    const apps = this.getApplications();
    const balances = this.getBalances();

    const leaveTypeName =
      data.leaveTypeId === 'lt_cl'
        ? 'Casual Leave'
        : data.leaveTypeId === 'lt_el'
          ? 'Earned / Privilege Leave'
          : data.leaveTypeId === 'lt_sl'
            ? 'Sick Leave'
            : 'Compensatory Off';
    const code =
      data.leaveTypeId === 'lt_cl'
        ? 'CL'
        : data.leaveTypeId === 'lt_el'
          ? 'EL'
          : data.leaveTypeId === 'lt_sl'
            ? 'SL'
            : 'COMP';

    const newApp: LeaveApplicationItem = {
      id: `app_${Date.now()}`,
      leaveTypeName,
      code,
      startDate: data.startDate,
      endDate: data.endDate,
      dayCount: data.dayCount,
      reason: data.reason,
      approverName: '009 · Ranjith Kumar C',
      status: 'PENDING',
      appliedOn: new Date()
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/ /g, '-'),
    };

    const updatedApps = [newApp, ...apps];
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, updatedApps);

    // Adjust pending days on the matching balance
    const updatedBalances = balances.map((b) => {
      if (b.leaveTypeId === data.leaveTypeId) {
        return {
          ...b,
          pendingDays: b.pendingDays + data.dayCount,
        };
      }
      return b;
    });
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.LEAVE_BALANCES, updatedBalances);

    return updatedApps;
  }

  approveApplication(id: string): LeaveApplicationItem[] {
    const apps = this.getApplications();
    const updated = apps.map((a) => (a.id === id ? { ...a, status: 'APPROVED' as const } : a));
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, updated);
    return updated;
  }

  rejectApplication(id: string): LeaveApplicationItem[] {
    const apps = this.getApplications();
    const updated = apps.map((a) => (a.id === id ? { ...a, status: 'REJECTED' as const } : a));
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.LEAVE_APPLICATIONS, updated);
    return updated;
  }
}

export const leaveRepository = new LocalLeaveRepository();
