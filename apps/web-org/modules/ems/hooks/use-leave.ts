'use client';

import { useCallback, useMemo } from 'react';
import {
  hasPermission,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { leaveRepository, type CreateLeaveRequestInput } from '../repositories/leave.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

type Loaded = { types: LeaveType[]; balances: LeaveBalance[]; requests: LeaveRequest[] };

/**
 * The signed-in employee's own leave.
 *
 * Balances come from the server and are shown as returned. Nothing is derived locally: the
 * reservation held against a pending request is already excluded from `availableAmount`, so
 * recomputing entitlement here would disagree with what the approver and payroll see.
 */
export function useLeave() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadTypes = hasPermission(permissions, 'leave.types.read');
  const canReadBalances = hasPermission(permissions, 'leave.balances.read');
  const canReadRequests = hasPermission(permissions, 'leave.requests.read');
  const canWrite = hasPermission(permissions, 'leave.requests.write');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [types, balances, requests] = await Promise.all([
        canReadTypes ? leaveRepository.listTypes(organizationId!) : Promise.resolve([]),
        canReadBalances && employeeId
          ? leaveRepository.listBalances(organizationId!, employeeId)
          : Promise.resolve([]),
        canReadRequests && employeeId
          ? leaveRepository.listRequests(organizationId!, { employeeId })
          : Promise.resolve([]),
      ]);
      return { types, balances, requests };
    },
    [organizationId, employeeId, canReadTypes, canReadBalances, canReadRequests],
    { enabled: Boolean(organizationId) && (canReadTypes || canReadBalances || canReadRequests) },
  );

  const { saving, saveError, setSaveError, run } = useMutationRunner(resource.refetch);

  const apply = useCallback(
    (input: Omit<CreateLeaveRequestInput, 'employeeId'>) => {
      if (!employeeId) {
        setSaveError('This account has no employee record, so leave cannot be requested.');
        return Promise.resolve(false);
      }
      return run(
        () => leaveRepository.createRequest(organizationId!, { ...input, employeeId }),
        'The leave request could not be submitted.',
      );
    },
    [employeeId, organizationId, run],
  );

  const cancel = useCallback(
    (requestId: string, reason: string) =>
      run(
        () => leaveRepository.cancel(organizationId!, requestId, reason),
        'The leave request could not be cancelled.',
      ),
    [organizationId, run],
  );

  const typesById = useMemo(
    () => new Map((resource.data?.types ?? []).map((type) => [type.id, type])),
    [resource.data],
  );

  return {
    types: resource.data?.types ?? [],
    typesById,
    balances: resource.data?.balances ?? [],
    requests: resource.data?.requests ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    apply,
    cancel,
    canWrite,
    canReadBalances,
    /** True when the signed-in user has no employee record, so leave cannot be requested. */
    hasNoEmployeeRecord: !employeeId,
  };
}

export type LeaveState = ReturnType<typeof useLeave>;
