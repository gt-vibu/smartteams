'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type Department } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository, type DepartmentInput } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * The organization's departments, and creating or changing one. Used by the Departments tab and
 * by onboarding's quick add, so both go through exactly the same save.
 */
export function useDepartments() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');
  const canWrite = hasPermission(permissions, 'employees.write');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource<Department[]>(
    () => workforceRepository.listDepartments(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const run = useCallback(
    async <T>(work: () => Promise<T>, fallback: string): Promise<T | null> => {
      if (!organizationId) return null;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await work();
        await resource.refetch();
        return result;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : fallback);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, resource],
  );

  return {
    departments: resource.data ?? [],
    loading: resource.loading,
    error: resource.error,
    canWrite,
    saving,
    saveError,
    clearError: () => setSaveError(null),
    /** Creates (no id) or updates a department. Resolves to its id, or null when refused. */
    save: (departmentId: string | null, input: DepartmentInput) =>
      run(
        async () =>
          (await workforceRepository.saveDepartment(organizationId!, departmentId, input)).id,
        'The department could not be saved.',
      ),
    removeMember: (departmentId: string, employeeId: string) =>
      run(
        () => workforceRepository.removeDepartmentMember(organizationId!, departmentId, employeeId),
        'The employee could not be removed from the department.',
      ),
  };
}

export type DepartmentsState = ReturnType<typeof useDepartments>;
