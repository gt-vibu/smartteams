'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type PayComponentDefinition,
  type SalaryProfile,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { payrollRepository } from '../repositories/payroll.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * Compensation configuration: the organisation's pay-component catalogue, and one employee's
 * salary profile with the components assigned to them.
 *
 * The screen this feeds replaced a builder that modelled "salary structures" — named templates
 * targeted at roles and departments, each with its own statutory switches. No such entity exists
 * in this backend. Compensation is: an organisation payroll policy, a gross salary per employee,
 * and effective-dated component assignments. The hook exposes exactly those.
 */
export function useCompensation() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadComponents = hasPermission(permissions, 'payroll.components.read');
  const canWriteComponents = hasPermission(permissions, 'payroll.components.write');
  const canReadProfile = hasPermission(permissions, 'payroll.employee-profile.read.all');
  const canWriteProfile = hasPermission(permissions, 'payroll.employee-profile.write');

  const canWritePolicy = hasPermission(permissions, 'payroll.policy.write');

  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const catalog = useAsyncResource<PayComponentDefinition[]>(
    () => payrollRepository.listComponents(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadComponents },
  );

  const profile = useAsyncResource<SalaryProfile>(
    () => payrollRepository.getSalaryProfile(organizationId!, employeeId ?? undefined),
    [organizationId, employeeId],
    { enabled: Boolean(organizationId) && Boolean(employeeId) && canReadProfile },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([catalog.refetch(), profile.refetch()]);
  }, [catalog, profile]);

  const { saving, saveError, setSaveError, run } = useMutationRunner(refetchAll);

  const createComponent = useCallback(
    (input: {
      code: string;
      name: string;
      componentType: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
      calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
      isTaxable: boolean;
    }) =>
      run(
        () => payrollRepository.createComponent(organizationId!, input),
        'The pay component could not be created.',
      ),
    [organizationId, run],
  );

  const assignComponent = useCallback(
    (input: {
      payComponentId: string;
      amount?: number;
      percentage?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }) =>
      run(
        () =>
          payrollRepository.assignComponent(organizationId!, { ...input, employeeId: employeeId! }),
        'The component could not be assigned.',
      ),
    [employeeId, organizationId, run],
  );

  const saveSalary = useCallback(
    (input: {
      grossSalary: number;
      overtimeMultiplier: number;
      effectiveFrom: string;
      payrollEnabled: boolean;
      salarySlipMode: string;
      pfEnabled: boolean;
      esiEnabled: boolean;
      ptEnabled: boolean;
    }) =>
      run(
        () =>
          payrollRepository.saveSalaryProfile(organizationId!, {
            ...input,
            employeeId: employeeId!,
            payType: 'SALARY',
            payFrequency: 'MONTHLY',
          }),
        'The salary profile could not be saved.',
      ),
    [employeeId, organizationId, run],
  );

  const savePolicy = useCallback(
    (input: {
      effectiveFrom: string;
      basePercentage: number;
      hraPercentage: number;
      baseMinimum?: number;
      payrollDayBasis?: number;
      salarySlipDefault?: boolean;
      payrollEnabledDefault?: boolean;
      pfDefault?: boolean;
      esiDefault?: boolean;
      ptDefault?: boolean;
      statutoryJurisdiction?: string;
      roundingMode?: 'HALF_UP' | 'DOWN' | 'UP';
    }) =>
      run(() => {
        const currentPolicy = profile.data?.organizationPolicy;
        return payrollRepository.savePolicy(organizationId!, {
          effectiveFrom: input.effectiveFrom,
          basePercentage: input.basePercentage,
          hraPercentage: input.hraPercentage,
          baseMinimum:
            input.baseMinimum ??
            (currentPolicy?.baseMinimum ? Number(currentPolicy.baseMinimum) : 15000),
          payrollDayBasis: input.payrollDayBasis ?? currentPolicy?.payrollDayBasis ?? 30,
          salarySlipDefault: input.salarySlipDefault ?? currentPolicy?.salarySlipDefault ?? true,
          payrollEnabledDefault:
            input.payrollEnabledDefault ?? currentPolicy?.payrollEnabledDefault ?? true,
          pfDefault: input.pfDefault ?? currentPolicy?.pfDefault ?? true,
          esiDefault: input.esiDefault ?? currentPolicy?.esiDefault ?? true,
          ptDefault: input.ptDefault ?? currentPolicy?.ptDefault ?? true,
          statutoryJurisdiction:
            input.statutoryJurisdiction ?? currentPolicy?.statutoryJurisdiction ?? 'KARNATAKA',
          roundingMode:
            input.roundingMode ??
            (currentPolicy?.roundingMode as 'HALF_UP' | 'DOWN' | 'UP' | undefined) ??
            'HALF_UP',
        });
      }, 'The salary policy could not be saved.'),
    [organizationId, profile.data, run],
  );

  return {
    components: useMemo(() => catalog.data ?? [], [catalog.data]),
    componentsLoading: catalog.loading,
    componentsError: catalog.error,
    componentsForbidden: catalog.forbidden || !canReadComponents,

    employeeId,
    selectEmployee: setEmployeeId,
    profile: profile.data ?? null,
    profileLoading: profile.loading,
    profileError: profile.error,
    profileForbidden: profile.forbidden || !canReadProfile,

    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createComponent,
    assignComponent,
    saveSalary,
    savePolicy,
    refetch: refetchAll,
    can: {
      createComponent: canWriteComponents,
      assign: canWriteComponents,
      saveSalary: canWriteProfile,
      savePolicy: canWritePolicy || canWriteProfile,
    },
  };
}

export type CompensationState = ReturnType<typeof useCompensation>;
