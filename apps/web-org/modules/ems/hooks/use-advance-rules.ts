'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { payrollRepository, type AdvanceRules } from '../repositories/payroll.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The company's salary-advance rules: the most anyone may ask for or owe, as a share of their
 * monthly salary, and how many months an approved advance is paid back over.
 */
export function useAdvanceRules() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'payroll.advances.read');
  const canWrite = hasPermission(permissions, 'payroll.policy.write');

  const rules = useAsyncResource<AdvanceRules>(
    () => payrollRepository.getAdvanceRules(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const refetch = useCallback(async () => {
    await rules.refetch();
  }, [rules]);
  const { saving, saveError, run } = useMutationRunner(refetch);

  const save = useCallback(
    (input: AdvanceRules) =>
      run(
        () => payrollRepository.saveAdvanceRules(organizationId!, input),
        'Could not save the advance rules',
      ),
    [organizationId, run],
  );

  return {
    rules: rules.data ?? null,
    canRead,
    canWrite,
    saving,
    saveError,
    save,
  };
}
