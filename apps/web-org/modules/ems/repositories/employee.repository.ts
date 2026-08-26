import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import { emsStorageAdapter } from '../storage/storage.adapter';
import employeesFixture from '../data/fixtures/employees.json';
import { EmployeeProfile } from '../types/employee.types';

export type { EmployeeProfile };


export interface IEmployeeRepository {
  getCurrentEmployee(): EmployeeProfile;
  updateProfile(updates: Partial<EmployeeProfile>): EmployeeProfile;
  updateAvatar(avatarUrl: string | null): EmployeeProfile;
}

export class LocalEmployeeRepository implements IEmployeeRepository {
  getCurrentEmployee(): EmployeeProfile {
    return emsStorageAdapter.getItem<EmployeeProfile>(
      EMS_STORAGE_KEYS.EMPLOYEE,
      employeesFixture.currentEmployee
    );
  }

  updateProfile(updates: Partial<EmployeeProfile>): EmployeeProfile {
    const current = this.getCurrentEmployee();
    const updated: EmployeeProfile = {
      ...current,
      ...updates,
    };
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.EMPLOYEE, updated);
    return updated;
  }

  updateAvatar(avatarUrl: string | null): EmployeeProfile {
    return this.updateProfile({ avatarUrl });
  }
}

export const employeeRepository = new LocalEmployeeRepository();
