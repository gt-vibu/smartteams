'use client';

import { useCallback, useMemo } from 'react';
import {
  hasPermission,
  type Payslip,
  type SalaryAdvance,
  type SalaryProfile,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { payrollRepository } from '../repositories/payroll.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The signed-in employee's own payroll: salary structure, payslips and salary advances.
 *
 * No `employeeId` is sent. The API narrows each of these reads to the caller's own employee
 * record unless they hold the matching `…read.all`, so naming an employee here would be
 * redundant at best and rejected at worst.
 *
 * The screen this feeds used to compute its own PF, professional tax and income tax. Everything
 * here is read from the API instead — including the salary breakdown, which the backend derives
 * from the organisation's payroll policy and statutory rules.
 */
export function usePayroll() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadProfile = hasPermission(permissions, 'payroll.employee-profile.read');
  const canReadPayslips = hasPermission(permissions, 'payroll.payslips.read');
  const canReadAdvances = hasPermission(permissions, 'payroll.advances.read');
  const canRequestAdvance = hasPermission(permissions, 'payroll.advances.request');

  const profileResource = useAsyncResource<SalaryProfile>(
    () => payrollRepository.getSalaryProfile(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadProfile },
  );

  const payslipResource = useAsyncResource<Payslip[]>(
    () => payrollRepository.listPayslips(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadPayslips },
  );

  const advanceResource = useAsyncResource<SalaryAdvance[]>(
    () => payrollRepository.listAdvances(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadAdvances },
  );

  const { saving, saveError, run } = useMutationRunner(advanceResource.refetch);

  const requestAdvance = useCallback(
    (input: { requestedAmount: number; reason: string }) =>
      run(
        () =>
          payrollRepository.requestAdvance(organizationId!, { ...input, employeeId: employeeId! }),
        'The salary advance could not be requested.',
      ),
    [employeeId, organizationId, run],
  );

  return {
    profile: profileResource.data ?? null,
    payslips: useMemo(() => payslipResource.data ?? [], [payslipResource.data]),
    advances: useMemo(() => advanceResource.data ?? [], [advanceResource.data]),

    loading: profileResource.loading || payslipResource.loading || advanceResource.loading,
    error: profileResource.error ?? payslipResource.error ?? advanceResource.error,
    profileForbidden: profileResource.forbidden || !canReadProfile,
    payslipsForbidden: payslipResource.forbidden || !canReadPayslips,
    advancesForbidden: advanceResource.forbidden || !canReadAdvances,
    refetch: useCallback(async () => {
      await Promise.all([
        profileResource.refetch(),
        payslipResource.refetch(),
        advanceResource.refetch(),
      ]);
    }, [advanceResource, payslipResource, profileResource]),

    saving,
    saveError,
    requestAdvance,
    canRequestAdvance,
    /** True when the signed-in user has no employee record, so none of this can resolve. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type PayrollState = ReturnType<typeof usePayroll>;
