'use client';

import { useCallback, useState } from 'react';
import type { Employee, EmployeeDetail } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';

export type EmployeeEditForm = {
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  employmentType: string;
  dateOfJoining: string;
  primaryBranchId: string;
  departmentId: string;
  departmentName: string;
  jobTitle: string;
  managerEmployeeId: string;
};

const today = () => new Date().toLocaleDateString('en-CA');
const clean = (value: string) => value.trim();

/** The form's starting values, from what the employee has now. */
export function editFormFrom(employee: Employee, detail: EmployeeDetail): EmployeeEditForm {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail ?? '',
    personalEmail: employee.personalEmail ?? '',
    phone: employee.phone ?? '',
    employmentType: employee.employmentType,
    dateOfJoining: detail.dateOfJoining?.slice(0, 10) ?? '',
    primaryBranchId: employee.primaryBranchId ?? '',
    departmentId: detail.departmentId ?? '',
    departmentName: detail.department ?? '',
    jobTitle: detail.jobTitle ?? '',
    managerEmployeeId: detail.managerEmployeeId ?? '',
  };
}

/**
 * Saves an edited employee. The fields live in different places, so only what changed is sent,
 * each to its own route: the record itself, the department, the job history (title, type and
 * manager) and the live manager pointer that approvals follow. The API checks every value
 * again: a duplicate email is refused there with who already has it.
 */
export function useEmployeeEdit() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (employee: Employee, before: EmployeeEditForm, after: EmployeeEditForm) => {
      if (!organizationId) return false;
      setSaving(true);
      setError(null);
      try {
        const changed = (key: keyof EmployeeEditForm) => clean(before[key]) !== clean(after[key]);
        const record = (
          ['firstName', 'lastName', 'workEmail', 'personalEmail', 'phone'] as const
        ).filter(changed);
        const patch = {
          ...Object.fromEntries(record.map((key) => [key, clean(after[key])])),
          ...(changed('employmentType') ? { employmentType: after.employmentType } : {}),
          ...(changed('dateOfJoining') && after.dateOfJoining
            ? { dateOfJoining: after.dateOfJoining }
            : {}),
          ...(changed('primaryBranchId') && after.primaryBranchId
            ? { primaryBranchId: after.primaryBranchId }
            : {}),
        };
        if (Object.keys(patch).length)
          await workforceRepository.updateEmployee(
            organizationId,
            employee.id,
            employee.version,
            patch,
          );

        if (changed('departmentId')) {
          if (after.departmentId)
            await workforceRepository.saveDepartment(organizationId, after.departmentId, {
              employeeIds: [employee.id],
            });
          else if (before.departmentId)
            await workforceRepository.removeDepartmentMember(
              organizationId,
              before.departmentId,
              employee.id,
            );
        }

        if (
          changed('jobTitle') ||
          changed('managerEmployeeId') ||
          changed('employmentType') ||
          changed('departmentId')
        )
          await workforceRepository.addEmploymentRecord(organizationId, employee.id, {
            ...(clean(after.jobTitle) ? { jobTitle: clean(after.jobTitle) } : {}),
            ...(after.departmentName ? { department: after.departmentName } : {}),
            ...(after.managerEmployeeId ? { managerEmployeeId: after.managerEmployeeId } : {}),
            employmentType: after.employmentType,
            status: employee.status,
            effectiveFrom: today(),
          });

        if (changed('managerEmployeeId') && after.managerEmployeeId)
          await workforceRepository.assignManager(
            organizationId,
            employee.id,
            after.managerEmployeeId,
          );
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The employee could not be saved.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId],
  );

  return { save, saving, error, clearError: () => setError(null) };
}
