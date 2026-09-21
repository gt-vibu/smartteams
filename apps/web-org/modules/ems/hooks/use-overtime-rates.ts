'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type OvertimeRates } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { payrollRepository } from '../repositories/payroll.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The company's overtime rates: the default for a new salary, and what a weekly off or a public
 * holiday pays. A rate left blank pays the employee's own multiplier, so nothing changes until
 * the company decides those days are worth more.
 */
export function useOvertimeRates() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'payroll.policy.read');
  const canWrite = hasPermission(permissions, 'payroll.policy.write');

  const rates = useAsyncResource<OvertimeRates>(
    () => payrollRepository.getOvertimeRates(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const refetch = useCallback(async () => {
    await rates.refetch();
  }, [rates]);
  const { saving, saveError, setSaveError, run } = useMutationRunner(refetch);

  const save = useCallback(
    (input: OvertimeRates) =>
      run(
        () => payrollRepository.saveOvertimeRates(organizationId!, input),
        'Could not save the overtime rates',
      ),
    [organizationId, run],
  );

  return {
    rates: rates.data ?? null,
    loading: rates.loading,
    error: rates.error,
    canRead,
    canWrite,
    saving,
    saveError,
    setSaveError,
    save,
  };
}

export type OvertimeRatesState = ReturnType<typeof useOvertimeRates>;
