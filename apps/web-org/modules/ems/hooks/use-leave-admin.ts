'use client';

import { useCallback, useMemo } from 'react';
import {
  hasPermission,
  type Employee,
  type LeaveBalance,
  type LeaveInboxEntry,
  type LeaveRequest,
  type LeaveType,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { leaveRepository, type LeaveTypeInput } from '../repositories/leave.repository';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

type Loaded = {
  types: LeaveType[];
  requests: LeaveRequest[];
  inbox: LeaveInboxEntry[];
  balances: LeaveBalance[];
  employees: Employee[];
};

/**
 * Organization-wide leave: the request queue, the approval inbox, policies and balances.
 *
 * The queue and inbox come from service methods that were already written and reachable over
 * federation, but had no native HTTP route until this module was reconciled.
 */
export function useLeaveAdmin() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadRequests = hasPermission(permissions, 'leave.requests.read');
  const canDecide = hasPermission(permissions, 'leave.requests.decide');
  const canReadTypes = hasPermission(permissions, 'leave.types.read');
  const canWriteTypes = hasPermission(permissions, 'leave.types.write');
  const canReadBalances = hasPermission(permissions, 'leave.balances.read');
  const canAdjust = hasPermission(permissions, 'leave.balances.adjust');
  const canReadEmployees = hasPermission(permissions, 'employees.read');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [types, requests, inbox, balances, employees] = await Promise.all([
        canReadTypes ? leaveRepository.listTypes(organizationId!) : Promise.resolve([]),
        canReadRequests
          ? leaveRepository.listRequests(organizationId!, { limit: 200 })
          : Promise.resolve([]),
        // The inbox is personal to the approver; without decide rights it is simply empty.
        canDecide ? leaveRepository.requestInbox(organizationId!) : Promise.resolve([]),
        canReadBalances ? leaveRepository.listBalances(organizationId!) : Promise.resolve([]),
        canReadEmployees ? workforceRepository.listEmployees(organizationId!) : Promise.resolve([]),
      ]);
      return { types, requests, inbox, balances, employees };
    },
    [organizationId, canReadTypes, canReadRequests, canDecide, canReadBalances, canReadEmployees],
    { enabled: Boolean(organizationId) && (canReadRequests || canReadTypes) },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const decide = useCallback(
    (requestId: string, status: 'APPROVED' | 'REJECTED', comment: string) =>
      run(
        () => leaveRepository.decide(organizationId!, requestId, status, comment),
        'The decision could not be recorded.',
      ),
    [organizationId, run],
  );

  const createType = useCallback(
    (input: LeaveTypeInput) =>
      run(
        () => leaveRepository.createType(organizationId!, input),
        'The leave type could not be saved.',
      ),
    [organizationId, run],
  );

  const assignType = useCallback(
    (code: string, branchId: string) =>
      run(
        () => leaveRepository.assignTypeToBranch(organizationId!, code, branchId),
        'The leave type could not be assigned.',
      ),
    [organizationId, run],
  );

  const adjustBalance = useCallback(
    (input: {
      employeeId: string;
      leaveTypeId: string;
      amount: number;
      reason: string;
      periodStart: string;
      periodEnd: string;
    }) =>
      run(
        () => leaveRepository.adjustBalance(organizationId!, input),
        'The balance could not be adjusted.',
      ),
    [organizationId, run],
  );

  return {
    types: resource.data?.types ?? [],
    requests: resource.data?.requests ?? [],
    inbox: resource.data?.inbox ?? [],
    balances: resource.data?.balances ?? [],
    employees: resource.data?.employees ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    decide,
    createType,
    assignType,
    adjustBalance,
    canDecide,
    canWriteTypes,
    canAdjust,
  };
}

export type LeaveAdminState = ReturnType<typeof useLeaveAdmin>;
