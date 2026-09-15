'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { leaveRepository } from '../repositories/leave.repository';
import { attendanceRepository } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * Everything awaiting the signed-in user's decision, across the domains that have an inbox.
 *
 * There is no unified approvals API: each module owns its own queue and its own decision route,
 * and the server decides whether the caller may approve. This hook composes the two inboxes that
 * exist — leave requests and attendance corrections — rather than inventing a third surface.
 *
 * Timesheet and payroll approvals have no inbox route, so they are not listed here at all.
 */

export type ApprovalDomainKey = 'LEAVE' | 'ATTENDANCE_CORRECTION';

export type ApprovalInboxItem = {
  id: string;
  domain: ApprovalDomainKey;
  employeeId: string;
  title: string;
  detail: string;
  submittedAt: string | null;
};

export function useApprovalInbox() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadLeave = hasPermission(permissions, 'leave.requests.read');
  const canDecideLeave = hasPermission(permissions, 'leave.requests.decide');
  const canReadAttendance = hasPermission(permissions, 'attendance.read');
  const canDecideAttendance = hasPermission(permissions, 'attendance.corrections.decide');

  const leave = useAsyncResource<unknown[]>(
    () => leaveRepository.requestInbox(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadLeave },
  );

  const attendance = useAsyncResource<unknown[]>(
    () => attendanceRepository.correctionInbox(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadAttendance },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([leave.refetch(), attendance.refetch()]);
  }, [attendance, leave]);

  const { saving, saveError, setSaveError, run } = useMutationRunner(refetchAll);

  const items: ApprovalInboxItem[] = useMemo(() => {
    const leaveItems = (leave.data ?? []).map((entry) => {
      const request = entry as {
        id: string;
        employeeId: string;
        startDate?: string;
        endDate?: string;
        reason?: string | null;
        createdAt?: string;
      };
      return {
        id: request.id,
        domain: 'LEAVE' as const,
        employeeId: request.employeeId,
        title: 'Leave request',
        detail: `${request.startDate?.slice(0, 10) ?? '--'} to ${request.endDate?.slice(0, 10) ?? '--'}${
          request.reason ? ` · ${request.reason}` : ''
        }`,
        submittedAt: request.createdAt ?? null,
      };
    });
    const attendanceItems = (attendance.data ?? []).map((entry) => {
      const correction = entry as {
        id: string;
        employeeId?: string;
        reason?: string | null;
        requestedAt?: string;
        afterSnapshot?: { missingCheckOut?: { occurredAt?: string } } | null;
      };
      // The approver has to see the time they are being asked to accept, not only the reason.
      const requestedCheckOut = correction.afterSnapshot?.missingCheckOut?.occurredAt;
      return {
        id: correction.id,
        domain: 'ATTENDANCE_CORRECTION' as const,
        employeeId: correction.employeeId ?? '',
        title: requestedCheckOut ? 'Missing check-out' : 'Attendance correction',
        detail: requestedCheckOut
          ? `Check-out at ${new Date(requestedCheckOut).toLocaleString(undefined, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })} · ${correction.reason ?? ''}`
          : (correction.reason ?? '--'),
        submittedAt: correction.requestedAt ?? null,
      };
    });
    return [...leaveItems, ...attendanceItems];
  }, [attendance.data, leave.data]);

  const decide = useCallback(
    (item: ApprovalInboxItem, status: 'APPROVED' | 'REJECTED', comment: string) =>
      run(
        () =>
          item.domain === 'LEAVE'
            ? leaveRepository.decide(organizationId!, item.id, status, comment)
            : attendanceRepository.decideCorrection(organizationId!, item.id, status, comment),
        'The decision could not be recorded.',
      ),
    [organizationId, run],
  );

  return {
    items,
    loading: leave.loading || attendance.loading,
    error: leave.error ?? attendance.error,
    leaveForbidden: leave.forbidden || !canReadLeave,
    attendanceForbidden: attendance.forbidden || !canReadAttendance,
    refetch: refetchAll,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    decide,
    canDecide: (item: ApprovalInboxItem) =>
      item.domain === 'LEAVE' ? canDecideLeave : canDecideAttendance,
  };
}

export type ApprovalInboxState = ReturnType<typeof useApprovalInbox>;
