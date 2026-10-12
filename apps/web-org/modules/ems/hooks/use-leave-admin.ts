'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type Employee,
  type LeaveBalance,
  type LeaveInboxEntry,
  type LeaveRequest,
  type LeaveType,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  leaveRepository,
  type LeaveAdminSummary,
  type LeaveTypeInput,
} from '../repositories/leave.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import { useDataChanged } from '../lib/data-events';
import { useCursorPages } from './use-cursor-pages';

type Loaded = {
  types: LeaveType[];
  requests: LeaveRequest[];
  inbox: LeaveInboxEntry[];
  balances: LeaveBalance[];
  nextCursor?: string;
  summary?: LeaveAdminSummary;
};

/**
 * Organization-wide leave: the request queue, the approval inbox, policies and balances.
 *
 * The queue and inbox come from service methods that were already written and reachable over
 * federation, but had no native HTTP route until this module was reconciled.
 */
/** The keys each leave admin control waits on; shared by the hook and the panels. */
export const leaveAdminBusyKey = {
  assign: (code: string) => `assign:${code}`,
  createType: 'create-type',
  updateType: (typeId: string) => `update-type:${typeId}`,
  decide: (requestId: string) => `decide:${requestId}`,
  adjust: (employeeId: string, leaveTypeId: string) => `adjust:${employeeId}:${leaveTypeId}`,
} as const;

export function useLeaveAdmin(
  status = 'ALL',
  section = 'requests',
  search = '',
  filters: { employeeId?: string; departmentId?: string; from?: string; to?: string } = {},
) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadRequests = hasPermission(permissions, 'leave.requests.read');
  const canDecide = hasPermission(permissions, 'leave.requests.decide');
  const canReadTypes = hasPermission(permissions, 'leave.types.read');
  const canWriteTypes = hasPermission(permissions, 'leave.types.write');
  const canReadBalances = hasPermission(permissions, 'leave.balances.read');
  const canAdjust = hasPermission(permissions, 'leave.balances.adjust');
  const paging = useCursorPages(
    JSON.stringify([
      organizationId,
      status,
      search,
      section,
      filters.employeeId,
      filters.departmentId,
      filters.from,
      filters.to,
    ]),
  );

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [types, requests, inbox, balances, summary] = await Promise.all([
        canReadTypes ? leaveRepository.listTypes(organizationId!) : Promise.resolve([]),
        canReadRequests && section === 'requests'
          ? leaveRepository.listRequestPage(organizationId!, {
              status: status === 'ALL' ? undefined : status,
              search: search || undefined,
              employeeId: filters.employeeId || undefined,
              departmentId: filters.departmentId || undefined,
              from: filters.from || undefined,
              to: filters.to || undefined,
              cursor: paging.cursor,
              limit: 10,
            })
          : Promise.resolve({ requests: [] as LeaveRequest[], nextCursor: undefined }),
        // The inbox is personal to the approver; without decide rights it is simply empty.
        canDecide && section === 'requests'
          ? leaveRepository.requestInbox(organizationId!)
          : Promise.resolve([]),
        canReadBalances && section === 'balances'
          ? leaveRepository.listBalancePage(organizationId!, {
              search,
              cursor: paging.cursor,
              limit: 10,
            })
          : Promise.resolve({ balances: [] as LeaveBalance[], nextCursor: undefined }),
        hasPermission(permissions, 'leave.requests.read.all') && section === 'requests'
          ? leaveRepository.adminSummary(organizationId!)
          : Promise.resolve(undefined),
      ]);
      return {
        types,
        requests: requests.requests,
        nextCursor: section === 'balances' ? balances.nextCursor : requests.nextCursor,
        inbox,
        balances: balances.balances,
        summary,
      };
    },
    [
      organizationId,
      status,
      section,
      search,
      paging.cursor,
      canReadTypes,
      canReadRequests,
      canDecide,
      canReadBalances,
      filters.departmentId,
      filters.employeeId,
      filters.from,
      filters.to,
      permissions,
    ],
    {
      enabled: Boolean(organizationId) && (canReadRequests || canReadTypes || canReadBalances),
      preservePreviousDataKey: organizationId ? `${organizationId}:${section}` : null,
    },
  );

  // A new request, announced by a notification, joins the queue without a reload.
  useDataChanged(['leave'], resource.refetch);
  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  /**
   * Which actions are in flight, by key.
   *
   * One shared `saving` flag disabled every control on the screen — assigning one leave type greyed
   * out every other type, every balance and every request while the lists reloaded, which read as
   * the whole page refreshing. Each control now waits only on its own action.
   */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const track = useCallback(async (key: string, operation: () => Promise<boolean>) => {
    setPending((current) => new Set(current).add(key));
    try {
      return await operation();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);
  const isBusy = useCallback((key: string) => pending.has(key), [pending]);

  const decide = useCallback(
    (requestId: string, status: 'APPROVED' | 'REJECTED', comment: string) =>
      track(leaveAdminBusyKey.decide(requestId), () =>
        run(
          () => leaveRepository.decide(organizationId!, requestId, status, comment),
          'The decision could not be recorded.',
        ),
      ),
    [organizationId, run, track],
  );

  const createType = useCallback(
    (input: LeaveTypeInput) =>
      track(leaveAdminBusyKey.createType, () =>
        run(
          () => leaveRepository.createType(organizationId!, input),
          'The leave type could not be saved.',
        ),
      ),
    [organizationId, run, track],
  );

  const updateType = useCallback(
    (typeId: string, input: Omit<LeaveTypeInput, 'code'>) =>
      track(leaveAdminBusyKey.updateType(typeId), () =>
        run(
          () => leaveRepository.updateType(organizationId!, typeId, input),
          'The leave type could not be saved.',
        ),
      ),
    [organizationId, run, track],
  );

  const assignType = useCallback(
    (code: string, branchId: string) =>
      track(leaveAdminBusyKey.assign(code), () =>
        run(
          () => leaveRepository.assignTypeToBranch(organizationId!, code, branchId),
          'The leave type could not be assigned.',
        ),
      ),
    [organizationId, run, track],
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
      track(leaveAdminBusyKey.adjust(input.employeeId, input.leaveTypeId), () =>
        run(
          () => leaveRepository.adjustBalance(organizationId!, input),
          'The balance could not be adjusted.',
        ),
      ),
    [organizationId, run, track],
  );

  return {
    organizationId,
    canReadBalances,
    paging,
    nextCursor: resource.data?.nextCursor,
    types: resource.data?.types ?? [],
    requests: resource.data?.requests ?? [],
    inbox: resource.data?.inbox ?? [],
    balances: resource.data?.balances ?? [],
    summary: resource.data?.summary,
    employees: [] as Employee[],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    isBusy,
    saveError,
    decide,
    createType,
    updateType,
    assignType,
    adjustBalance,
    canDecide,
    canWriteTypes,
    canAdjust,
  };
}

export type LeaveAdminState = ReturnType<typeof useLeaveAdmin>;
