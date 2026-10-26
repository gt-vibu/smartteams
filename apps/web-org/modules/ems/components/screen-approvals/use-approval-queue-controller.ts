'use client';
import { useEffect, useState } from 'react';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';

export const approvalItemKey = (item: Pick<ApprovalInboxItem, 'id' | 'domain'>) =>
  `${item.domain}-${item.id}`;
export type PendingDecision = { items: ApprovalInboxItem[]; status: 'APPROVED' | 'REJECTED' };

export function useApprovalQueueController(inbox: ApprovalInboxState) {
  const [deciding, setDeciding] = useState<PendingDecision | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [checkOutDate, setCheckOutDate] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [operating, setOperating] = useState(false);
  const selectable = inbox.items.filter(
    (item) =>
      ['LEAVE', 'ATTENDANCE_CORRECTION'].includes(item.domain) &&
      !item.requiresIndividualReview &&
      !item.proposedCheckOut &&
      inbox.canDecide(item),
  );
  const chosen = selectable.filter((item) => selected.has(approvalItemKey(item)));
  const single = deciding?.items.length === 1 ? deciding.items[0] : null;
  const replacement =
    checkOutDate && checkOutTime ? new Date(`${checkOutDate}T${checkOutTime}:00`) : null;
  const replacementInvalid = replacement !== null && Number.isNaN(replacement.getTime());
  const busy = inbox.saving || operating || Boolean(inbox.batch?.running);
  useEffect(() => {
    if (inbox.batch?.state?.state === 'completed')
      setSelected(
        new Set(
          inbox.batch.state.results
            .filter((row) => row.outcome === 'FAILED')
            .map((row) => `${row.domain}-${row.id}`),
        ),
      );
  }, [inbox.batch?.state]);
  const execute = async (
    items: ApprovalInboxItem[],
    status: 'APPROVED' | 'REJECTED',
    checkOutAt?: string,
  ) => {
    if (busy) return false;
    setOperating(true);
    try {
      if (
        items.length > 1 &&
        inbox.batch &&
        items.every(
          (item) => item.currentStep && ['LEAVE', 'ATTENDANCE_CORRECTION'].includes(item.domain),
        )
      ) {
        return await inbox.batch.start(
          items.map((item) => ({
            id: item.id,
            domain: item.domain as 'LEAVE' | 'ATTENDANCE_CORRECTION',
            expectedStepNumber: item.currentStep!.stepNumber,
            label: `${item.requester} · ${item.title}`.slice(0, 200),
          })),
          status,
          '',
        );
      }
      const failed: string[] = [];
      for (const item of items) {
        const ok = checkOutAt
          ? await inbox.decide(item, status, '', checkOutAt)
          : await inbox.decide(item, status, '');
        if (!ok) failed.push(approvalItemKey(item));
      }
      if (items.length > 1)
        setBulkResult(
          `${items.length - failed.length} decisions recorded; ${failed.length} need attention.`,
        );
      setSelected(new Set(failed));
      return failed.length === 0;
    } finally {
      setOperating(false);
    }
  };
  const reset = () => {
    inbox.dismissError();
    setBulkResult(null);
    setCheckOutDate('');
    setCheckOutTime('');
  };
  const handleApprove = async (items: ApprovalInboxItem[]) => {
    reset();
    if (items.length === 1 && items[0]?.proposedCheckOut) {
      setDeciding({ items, status: 'APPROVED' });
      return;
    }
    await execute(items, 'APPROVED');
  };
  const openRejection = (items: ApprovalInboxItem[]) => {
    reset();
    setDeciding({ items, status: 'REJECTED' });
  };
  const confirm = async () => {
    if (!deciding || replacementInvalid) return;
    const ok = await execute(
      deciding.items,
      deciding.status,
      single && replacement && deciding.status === 'APPROVED'
        ? replacement.toISOString()
        : undefined,
    );
    if (ok) setDeciding(null);
  };
  return {
    deciding,
    setDeciding,
    selected,
    setSelected,
    selectable,
    chosen,
    single,
    bulkResult,
    checkOutDate,
    setCheckOutDate,
    checkOutTime,
    setCheckOutTime,
    replacementInvalid,
    busy,
    handleApprove,
    openRejection,
    confirm,
  };
}
