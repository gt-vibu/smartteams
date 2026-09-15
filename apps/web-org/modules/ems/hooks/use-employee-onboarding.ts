'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type Employee } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { apiRequest } from '../lib/api-client';
import { orgPath } from '../repositories/api-helpers';
import { workforceRepository } from '../repositories/workforce.repository';

/**
 * Bringing a new employee into the organization.
 *
 * Onboarding is several server operations, not one: the employee record, then the employment
 * record that carries job title and department, then the reporting line, then optionally a login
 * and the link between the two. The API has no single transaction spanning them, so this runs
 * them in order and reports exactly how far it got.
 *
 * That honesty is the point. A half-onboarded employee is a real outcome — the record exists, the
 * manager is set, the account failed — and reporting it as either "done" or "failed" would be a
 * lie in one direction or the other. The employee id is always returned once step one succeeds,
 * so the caller can send the administrator to the record that does exist.
 */

export type OnboardingInput = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  employmentType: string;
  dateOfJoining: string;
  primaryBranchId?: string;
  jobTitle?: string;
  department?: string;
  managerEmployeeId?: string;
  /** When set, a login is created with the EMPLOYEE role and linked to the new employee. */
  account?: { email: string; displayName: string; roleId: string };
};

export type OnboardingStep = 'employee' | 'employment' | 'manager' | 'account' | 'link';

export type OnboardingResult = {
  employee: Employee | null;
  completed: OnboardingStep[];
  /** The step that failed and why, or null when every requested step succeeded. */
  failure: { step: OnboardingStep; message: string } | null;
  /** Returned once, for the administrator to pass on. Never stored. */
  temporaryPassword: string | null;
  /** The address the new login signs in with. Needed alongside the password to be any use. */
  accountEmail: string | null;
};

export function useEmployeeOnboarding() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  // Server-side authorization is what actually decides; these only shape the UI. Every call
  // below is rejected by the API for a caller without the permission.
  const canOnboard = hasPermission(permissions, 'employees.write');
  const canCreateAccount = hasPermission(permissions, 'members.write');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const onboard = useCallback(
    async (input: OnboardingInput): Promise<OnboardingResult> => {
      if (!organizationId) throw new Error('No organization in session');
      setBusy(true);
      setResult(null);

      const completed: OnboardingStep[] = [];
      let employee: Employee | null = null;
      let temporaryPassword: string | null = null;
      let accountEmail: string | null = null;

      const finish = (failure: OnboardingResult['failure']): OnboardingResult => {
        const value = { employee, completed, failure, temporaryPassword, accountEmail };
        setResult(value);
        setBusy(false);
        return value;
      };

      const messageOf = (caught: unknown, fallback: string) =>
        caught instanceof Error ? caught.message : fallback;

      try {
        employee = await workforceRepository.createEmployee(organizationId, {
          employeeNumber: input.employeeNumber.trim(),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          employmentType: input.employmentType,
          dateOfJoining: input.dateOfJoining,
          ...(input.workEmail?.trim() ? { workEmail: input.workEmail.trim() } : {}),
          ...(input.personalEmail?.trim() ? { personalEmail: input.personalEmail.trim() } : {}),
          ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
          ...(input.primaryBranchId ? { primaryBranchId: input.primaryBranchId } : {}),
        });
        completed.push('employee');
      } catch (caught) {
        return finish({
          step: 'employee',
          message: messageOf(caught, 'The employee could not be created.'),
        });
      }

      // Job title and department have nowhere else to live, so the employment record is written
      // whenever either is supplied — or whenever there is a manager to record against a period.
      if (input.jobTitle?.trim() || input.department?.trim() || input.managerEmployeeId) {
        try {
          await workforceRepository.addEmploymentRecord(organizationId, employee.id, {
            employmentType: input.employmentType,
            status: 'ACTIVE',
            effectiveFrom: input.dateOfJoining,
            ...(input.jobTitle?.trim() ? { jobTitle: input.jobTitle.trim() } : {}),
            ...(input.department?.trim() ? { department: input.department.trim() } : {}),
            ...(input.managerEmployeeId ? { managerEmployeeId: input.managerEmployeeId } : {}),
          });
          completed.push('employment');
        } catch (caught) {
          return finish({
            step: 'employment',
            message: messageOf(caught, 'The employment details could not be saved.'),
          });
        }
      }

      if (input.managerEmployeeId) {
        try {
          // Separate from the employment record above: this sets the live pointer approval
          // routing resolves against, where the record is the history.
          await workforceRepository.assignManager(
            organizationId,
            employee.id,
            input.managerEmployeeId,
          );
          completed.push('manager');
        } catch (caught) {
          return finish({
            step: 'manager',
            message: messageOf(caught, 'The manager could not be assigned.'),
          });
        }
      }

      if (input.account) {
        let userId: string;
        try {
          const created = (await apiRequest(orgPath(organizationId, '/members'), {
            method: 'POST',
            body: {
              email: input.account.email.trim(),
              displayName: input.account.displayName.trim(),
              roleIds: [input.account.roleId],
              reason: `Onboarding ${input.firstName.trim()} ${input.lastName.trim()}`,
            },
          })) as { userId?: string; temporaryPassword?: string | null };
          if (typeof created.userId !== 'string')
            throw new Error('The account was created but no user id came back.');
          userId = created.userId;
          temporaryPassword = created.temporaryPassword ?? null;
          accountEmail = input.account.email.trim();
          completed.push('account');
        } catch (caught) {
          return finish({
            step: 'account',
            message: messageOf(caught, 'The login could not be created.'),
          });
        }

        try {
          await workforceRepository.linkEmployeeUser(organizationId, employee.id, userId);
          completed.push('link');
        } catch (caught) {
          return finish({
            step: 'link',
            message: messageOf(caught, 'The login was created but could not be linked.'),
          });
        }
      }

      return finish(null);
    },
    [organizationId],
  );

  return {
    onboard,
    busy,
    result,
    reset: () => setResult(null),
    canOnboard,
    canCreateAccount,
  };
}

export type EmployeeOnboardingState = ReturnType<typeof useEmployeeOnboarding>;
