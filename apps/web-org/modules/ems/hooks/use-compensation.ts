'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type PayComponentDefinition,
  type PayrollPolicy,
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
 * The screen this feeds combines the tenant payroll defaults with employee salary records and
 * effective-dated component assignments. Role-wise allotment writes reviewed employee records;
 * individual records take precedence over the organization default.
 */
export function useCompensation() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadComponents = hasPermission(permissions, 'payroll.components.read');
  const canWriteComponents = hasPermission(permissions, 'payroll.components.write');
  const canReadProfile = hasPermission(permissions, 'payroll.employee-profile.read.all');
  const canWriteProfile = hasPermission(permissions, 'payroll.employee-profile.write');

  const canReadPolicy = hasPermission(permissions, 'payroll.policy.read');
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

  const organizationPolicy = useAsyncResource<PayrollPolicy>(
    () => payrollRepository.getPolicy(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadPolicy },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([catalog.refetch(), profile.refetch(), organizationPolicy.refetch()]);
  }, [catalog, organizationPolicy, profile]);

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

  /** Adds a component to the catalogue and assigns it to this employee in one step. */
  const createAndAssignComponent = useCallback(
    (
      component: {
        code: string;
        name: string;
        componentType: 'EARNING' | 'DEDUCTION';
        calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
        isTaxable: boolean;
      },
      assignment: {
        amount?: number;
        percentage?: number;
        effectiveFrom: string;
        effectiveTo?: string;
      },
    ) =>
      run(async () => {
        const created = await payrollRepository.createComponent(organizationId!, component);
        await payrollRepository.assignComponent(organizationId!, {
          ...assignment,
          payComponentId: created.id,
          employeeId: employeeId!,
        });
      }, 'The component could not be added.'),
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
      payrollPolicyId?: string;
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
      defaultGrossSalary?: number | null;
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
        const currentPolicy = organizationPolicy.data;
        if (!currentPolicy) throw new Error('Load the organization payroll policy before saving.');
        return payrollRepository.savePolicy(organizationId!, {
          effectiveFrom: input.effectiveFrom,
          basePercentage: input.basePercentage,
          hraPercentage: input.hraPercentage,
          baseMinimum: input.baseMinimum ?? Number(currentPolicy.baseMinimum),
          defaultGrossSalary:
            input.defaultGrossSalary === undefined
              ? (currentPolicy.defaultGrossSalary ?? null)
              : input.defaultGrossSalary,
          payrollDayBasis: input.payrollDayBasis ?? currentPolicy.payrollDayBasis,
          salarySlipDefault: input.salarySlipDefault ?? currentPolicy.salarySlipDefault,
          payrollEnabledDefault: input.payrollEnabledDefault ?? currentPolicy.payrollEnabledDefault,
          pfDefault: input.pfDefault ?? currentPolicy.pfDefault,
          esiDefault: input.esiDefault ?? currentPolicy.esiDefault,
          ptDefault: input.ptDefault ?? currentPolicy.ptDefault,
          statutoryJurisdiction:
            input.statutoryJurisdiction ?? currentPolicy.statutoryJurisdiction ?? undefined,
          roundingMode:
            input.roundingMode ??
            (currentPolicy.roundingMode as 'HALF_UP' | 'DOWN' | 'UP' | undefined) ??
            'HALF_UP',
        });
      }, 'The salary policy could not be saved.'),
    [organizationId, organizationPolicy.data, run],
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

    organizationPolicy: organizationPolicy.data,
    organizationPolicyLoading: organizationPolicy.loading,
    organizationPolicyError: organizationPolicy.error,
    organizationPolicyForbidden: organizationPolicy.forbidden || !canReadPolicy,

    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createComponent,
    assignComponent,
    createAndAssignComponent,
    saveSalary,
    savePolicy,
    refetch: refetchAll,
    can: {
      readProfiles: canReadProfile,
      readComponents: canReadComponents,
      createComponent: canWriteComponents,
      assign: canWriteComponents,
      saveSalary: canWriteProfile,
      savePolicy: canWritePolicy,
    },
  };
}

export type CompensationState = ReturnType<typeof useCompensation>;
