'use client';

import { formatDate } from '@smarteam/contracts';
import { useCallback, useMemo } from 'react';
import { leaveExtrasRepository } from '../repositories/leave-extras.repository';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';

export type LeaveExtraInboxItem = {
  id: string;
  domain: 'COMP_OFF' | 'ENCASHMENT';
  requester: string;
  title: string;
  detail: string;
};

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;

/**
 * Comp-off and encashment requests waiting on the signed-in user, for the approvals inbox.
 *
 * The server lists the caller's own requests and the ones they may decide, flagging which is
 * which; only the second kind, still pending, is an inbox item. Deciding goes to the same routes
 * the Time Off panel uses, so either place records the same decision.
 */
export function useLeaveExtrasInbox() {
  const { session } = useSession();
  const organizationId = session?.organizationId || null;
  const enabled = Boolean(organizationId);
  const compOffs = useAsyncResource(
    () => leaveExtrasRepository.compOffs(organizationId!),
    [organizationId],
    { enabled },
  );
  const encashments = useAsyncResource(
    () => leaveExtrasRepository.encashments(organizationId!),
    [organizationId],
    { enabled },
  );

  const items: LeaveExtraInboxItem[] = useMemo(
    () => [
      ...(compOffs.data ?? [])
        .filter((item) => !item.mine && item.status === 'PENDING')
        .map((item) => ({
          id: item.id,
          domain: 'COMP_OFF' as const,
          requester: item.employeeName,
          title: `Comp-off · ${item.days} ${item.days === 1 ? 'day' : 'days'}`,
          detail: `Worked ${formatDate(item.workDate)} (${hours(item.workedMinutes)}) · ${item.reason}`,
        })),
      ...(encashments.data ?? [])
        .filter((item) => !item.mine && item.status === 'PENDING')
        .map((item) => ({
          id: item.id,
          domain: 'ENCASHMENT' as const,
          requester: item.employeeName,
          title: `Leave encashment · ${item.days} ${item.days === 1 ? 'day' : 'days'}`,
          detail: `${item.leaveType}, paid in the next payroll once approved`,
        })),
    ],
    [compOffs.data, encashments.data],
  );

  const refetch = useCallback(async () => {
    await Promise.all([compOffs.refetch(), encashments.refetch()]);
  }, [compOffs, encashments]);

  const decide = useCallback(
    (
      item: { id: string; domain: 'COMP_OFF' | 'ENCASHMENT' },
      approve: boolean,
      comment?: string,
    ) => {
      const input = { approve, ...(comment?.trim() ? { comment: comment.trim() } : {}) };
      return item.domain === 'COMP_OFF'
        ? leaveExtrasRepository.decideCompOff(organizationId!, item.id, input)
        : leaveExtrasRepository.decideEncashment(organizationId!, item.id, input);
    },
    [organizationId],
  );

  return {
    items,
    loading: compOffs.loading || encashments.loading,
    error: compOffs.error ?? encashments.error,
    refetch,
    decide,
  };
}
