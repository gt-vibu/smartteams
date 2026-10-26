'use client';

import { useCallback, useMemo } from 'react';
import {
  employeeDisplayName,
  hasPermission,
  type Employee,
  type EmployeeDetail,
  type EmploymentRecord,
  type StatutoryProfile,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * One employee, as the detail drawer needs them.
 *
 * `jobTitle`, `department`, the employment dates and the reporting line are persisted but absent
 * from the shared employee DTO, which is the federation response contract. They come from the
 * native detail route instead of widening that contract — so the drawer no longer has to say
 * "reporting relationships are not available yet".
 */
export type EmployeeDetailView = {
  employee: Employee;
  detail: EmployeeDetail | null;
  displayName: string;
  initials: string;
  jobTitle: string | null;
  department: string | null;
  statutoryProfiles: StatutoryProfile[];
  employmentRecords: EmploymentRecord[];
  canReadCompliance: boolean;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0
    ? '--'
    : `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

export function useEmployeeDetail(employeeId: string | null) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'employees.read');
  const canWrite = hasPermission(permissions, 'employees.write');
  const canReadCompliance = hasPermission(permissions, 'payroll.compliance.read');

  const resource = useAsyncResource<EmployeeDetailView>(
    async () => {
      const [employee, detail, employmentRecords, statutoryProfiles] = await Promise.all([
        workforceRepository.getEmployee(organizationId!, employeeId!),
        workforceRepository.getEmployeeDetail(organizationId!, employeeId!),
        workforceRepository.listEmploymentRecords(organizationId!, employeeId!).catch(() => []),
        canReadCompliance
          ? workforceRepository.listStatutoryProfiles(organizationId!, employeeId!).catch(() => [])
          : Promise.resolve([]),
      ]);
      const displayName = employeeDisplayName(employee);
      return {
        employee,
        detail,
        displayName,
        initials: initialsOf(displayName),
        // Both now come from the detail route rather than a per-record lookup.
        jobTitle: detail.jobTitle,
        department: detail.department,
        statutoryProfiles,
        employmentRecords,
        canReadCompliance,
      };
    },
    [organizationId, employeeId, canReadCompliance],
    { enabled: Boolean(organizationId) && Boolean(employeeId) && canRead },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const linkUser = useCallback(
    (userId: string) =>
      run(
        () => workforceRepository.linkEmployeeUser(organizationId!, employeeId!, userId),
        'The user account could not be linked.',
      ),
    [employeeId, organizationId, run],
  );

  return {
    data: resource.data ?? null,
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: resource.refetch,
    saving,
    saveError,
    linkUser,
    canWrite,
  };
}
