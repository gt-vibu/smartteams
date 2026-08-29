// employee.repository.ts — profile always derived from persona, only avatar persisted
import { emsStorageAdapter } from '../storage/storage.adapter';
import { EmployeeProfile } from '../types/employee.types';
import { authRepository } from './auth.repository';

export type { EmployeeProfile };

export interface IEmployeeRepository {
  getCurrentEmployee(): EmployeeProfile;
  updateProfile(updates: Partial<EmployeeProfile>): EmployeeProfile;
  updateAvatar(avatarUrl: string | null): EmployeeProfile;
}

// Key used only for storing the user's custom avatar override
const AVATAR_OVERRIDE_KEY = 'ems_avatar_override';

export class LocalEmployeeRepository implements IEmployeeRepository {
  getCurrentEmployee(): EmployeeProfile {
    const persona = authRepository.getCurrentPersona();

    // Avatar can be overridden by the user via photo upload — stored separately
    const avatarOverride = emsStorageAdapter.getItem<string | null>(AVATAR_OVERRIDE_KEY, null);

    // ALWAYS build profile from the current persona — never from stale fixture data
    return {
      id: persona.user.id,
      employeeNumber: persona.employeeNumber,
      firstName: persona.name.split(' ')[0] || '',
      lastName: persona.name.split(' ').slice(1).join(' ') || '',
      workEmail: persona.email,
      jobTitle: persona.jobTitle,
      department: persona.department,
      location: persona.branchName,
      avatarUrl: avatarOverride ?? persona.avatarUrl ?? null,
      joinedDate: '2024-03-15',
      phone: '+91 98765 43210',
      manager: persona.managerName
        ? {
            id: persona.managerEmployeeId || 'mgr-01',
            employeeNumber: '009',
            firstName: persona.managerName.split(' ')[0] || '',
            lastName: persona.managerName.split(' ').slice(1).join(' ') || '',
            jobTitle: 'Manager',
            isOnline: true,
          }
        : null,
      departmentMembers: [],
    };
  }

  updateProfile(updates: Partial<EmployeeProfile>): EmployeeProfile {
    // For profile updates, persist only the avatar override
    if ('avatarUrl' in updates) {
      emsStorageAdapter.setItem(AVATAR_OVERRIDE_KEY, updates.avatarUrl ?? null);
    }
    // Re-derive profile from persona with the new avatar applied
    return this.getCurrentEmployee();
  }

  updateAvatar(avatarUrl: string | null): EmployeeProfile {
    emsStorageAdapter.setItem(AVATAR_OVERRIDE_KEY, avatarUrl);
    return this.getCurrentEmployee();
  }
}

export const employeeRepository = new LocalEmployeeRepository();
