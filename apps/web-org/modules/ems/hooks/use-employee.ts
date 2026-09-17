'use client';

import { useCallback, useMemo } from 'react';
import {
  currentEmploymentRecord,
  employeeDisplayName,
  joiningDateFrom,
  type Employee,
  type EmploymentRecord,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import type { EmployeeProfile } from '../types/employee.types';

/**
 * The signed-in user's employee record.
 *
 * Every field comes from the API. Where the backend has no data — job title before any
 * employment record exists, or an avatar image, which the schema does not model at all — the
 * value is null and the UI renders its unavailable state. Nothing is substituted.
 */
export type EmployeeProfileView = {
  employee: Employee;
  displayName: string;
  initials: string;
  /** Null until an employment record exists; the schema has no avatar image field. */
  jobTitle: string | null;
  department: string | null;
  joiningDate: string | null;
  managerEmployeeId: string | null;
  employmentHistory: EmploymentRecord[];
};

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function useEmployeeProfile() {
  const { session } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId || null;
  const enabled = Boolean(organizationId && employeeId);

  const state = useAsyncResource<EmployeeProfileView>(
    async () => {
      const [employee, history] = await Promise.all([
        workforceRepository.getEmployee(organizationId!, employeeId!),
        workforceRepository.listEmploymentRecords(organizationId!, employeeId!),
      ]);
      const current = currentEmploymentRecord(history);
      const displayName = employeeDisplayName(employee);
      return {
        employee,
        displayName,
        initials: initialsOf(displayName),
        jobTitle: current?.jobTitle ?? null,
        department: current?.department ?? null,
        joiningDate: joiningDateFrom(history),
        managerEmployeeId: current?.managerEmployeeId ?? null,
        employmentHistory: history,
      };
    },
    [organizationId, employeeId],
    { enabled },
  );

  /**
   * True when the signed-in user has no employee record in this tenant — an administrator
   * onboarded through the platform console, for example. Distinct from a load failure.
   */
  const hasEmployeeRecord = useMemo(() => Boolean(employeeId), [employeeId]);

  return { ...state, hasEmployeeRecord };
}

/**
 * Adapter to the `EmployeeProfile` shape the existing profile components consume.
 *
 * Fields the backend genuinely cannot supply are null or empty, never invented:
 *  - `avatarUrl` — the schema has no avatar image; the UI falls back to `initials`.
 *  - `manager` — only `managerEmployeeId` is stored, and there is no endpoint returning the
 *    manager's details, so this stays null.
 *  - `departmentMembers` — `department` is a free-text field on the employment record, not an
 *    entity, so there is no membership list to fetch.
 *
 * These gaps are listed in the module report rather than papered over.
 */
export function useEmployee() {
  const { data, loading, refreshing, error, forbidden, refetch, hasEmployeeRecord } =
    useEmployeeProfile();

  const employee: EmployeeProfile | null = data
    ? {
        id: data.employee.id,
        employeeNumber: data.employee.employeeNumber,
        firstName: data.employee.firstName,
        lastName: data.employee.lastName,
        workEmail: data.employee.workEmail,
        jobTitle: data.jobTitle,
        department: data.department,
        avatarUrl: null,
        joinedDate: data.joiningDate ?? undefined,
        phone: data.employee.phone ?? undefined,
        manager: null,
        departmentMembers: [],
      }
    : null;

  const { session } = useSession();

  /**
   * Persists a profile edit and refetches, so what the screen shows afterwards is what the
   * server stored rather than optimistic local state.
   */
  const updateProfile = useCallback(
    async (
      updates: Partial<Pick<EmployeeProfile, 'firstName' | 'lastName' | 'workEmail' | 'phone'>>,
    ) => {
      const organizationId = session?.organizationId;
      const employeeId = session?.employeeId;
      if (!organizationId || !employeeId) throw new Error('No employee record for this session.');
      // Optimistic concurrency: send the version we loaded. A concurrent edit elsewhere makes
      // this 409 rather than silently overwriting the other change.
      const version = data?.employee.version;
      if (version === undefined) throw new Error('Profile is still loading.');
      await workforceRepository.updateEmployee(organizationId, employeeId, version, {
        ...(updates.firstName !== undefined ? { firstName: updates.firstName } : {}),
        ...(updates.lastName !== undefined ? { lastName: updates.lastName } : {}),
        ...(updates.workEmail ? { workEmail: updates.workEmail } : {}),
        ...(updates.phone ? { phone: updates.phone } : {}),
      });
      await refetch();
    },
    [session, refetch, data],
  );

  return {
    employee,
    initials: data?.initials ?? '?',
    loading,
    refreshing,
    error,
    forbidden,
    refetch,
    hasEmployeeRecord,
    updateProfile,
  };
}
