'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type ApprovalPolicy } from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  approvalsRepository,
  type ApprovalPolicyInput,
} from '../repositories/approvals.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The organisation's approval routing rules.
 *
 * These are the policies leave, attendance corrections, timesheets and payroll actually route by.
 * The builder this replaced wrote them to `localStorage`, so the rules an administrator saw were
 * not the rules the server applied.
 */
export function useApprovalPolicies() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'approval-policies.read');
  const canWrite = hasPermission(permissions, 'approval-policies.write');

  const resource = useAsyncResource<ApprovalPolicy[]>(
    () => approvalsRepository.listPolicies(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, setSaveError, run } = useMutationRunner(resource.refetch);

  const createPolicy = useCallback(
    (input: ApprovalPolicyInput) =>
      run(
        () => approvalsRepository.createPolicy(organizationId!, input),
        'The approval policy could not be created.',
      ),
    [organizationId, run],
  );

  const updatePolicy = useCallback(
    (policyId: string, input: Partial<ApprovalPolicyInput>) =>
      run(
        () => approvalsRepository.updatePolicy(organizationId!, policyId, input),
        'The approval policy could not be updated.',
      ),
    [organizationId, run],
  );

  const deactivatePolicy = useCallback(
    (policyId: string, reason: string) =>
      run(
        () => approvalsRepository.deactivatePolicy(organizationId!, policyId, reason),
        'The approval policy could not be retired.',
      ),
    [organizationId, run],
  );

  return {
    policies: useMemo(() => resource.data ?? [], [resource.data]),
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: resource.refetch,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createPolicy,
    updatePolicy,
    deactivatePolicy,
    canWrite,
  };
}

export type ApprovalPolicyState = ReturnType<typeof useApprovalPolicies>;
