'use client';

import { formatDate } from '@smarteam/contracts';
import React, { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  Textarea,
  TimePicker,
} from '@smarteam/ui';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { HolidayReviewDialog } from './holiday-review-dialog';

/**
 * The queue of decisions routed to the signed-in user, and the dialog that records one.
 *
 * Shared by the Approvals screen and the Approvals tab on Home. Home used to render its own list of
 * three invented people whose Approve and Reject buttons changed only the browser's copy — nothing
 * reached the server, and the "Approved" badge that followed was not true. Both places now read the
 * same server inboxes, and a decision is shown as done only after the API has accepted it.
 */
export function ApprovalQueue({ inbox }: { inbox: ApprovalInboxState }) {
  const [deciding, setDeciding] = useState<{
    items: ApprovalInboxItem[];
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);
  // Several requests decided at once, with one comment: the everyday "approve these five leaves".
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const keyOf = (item: ApprovalInboxItem) => `${item.domain}-${item.id}`;
  const selectable = inbox.items.filter(
    (item) => item.domain !== 'HOLIDAY_CHECK_IN' && inbox.canDecide(item),
  );
  const chosen = selectable.filter((item) => selected.has(keyOf(item)));
  const single = deciding?.items.length === 1 ? deciding.items[0] : null;
  const [comment, setComment] = useState('');
  const [reviewing, setReviewing] = useState<ApprovalInboxItem | null>(null);
  // The approver's own check-out time, where they are not accepting the one proposed.
  const [checkOutDate, setCheckOutDate] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');

  const proposed =
    deciding?.status === 'APPROVED' && single?.proposedCheckOut
      ? new Date(single.proposedCheckOut)
      : null;
  const replacement =
    checkOutDate && checkOutTime ? new Date(`${checkOutDate}T${checkOutTime}:00`) : null;
  const replacementInvalid = replacement !== null && Number.isNaN(replacement.getTime());

  const openDecision = (items: ApprovalInboxItem[], status: 'APPROVED' | 'REJECTED') => {
    inbox.dismissError();
    setBulkResult(null);
    setDeciding({ items, status });
    setCheckOutDate('');
    setCheckOutTime('');
  };

  const confirm = async () => {
    if (!deciding || replacementInvalid) return;
    let done = 0;
    for (const item of deciding.items) {
      const decided = await inbox.decide(
        item,
        deciding.status,
        comment.trim(),
        single && replacement && deciding.status === 'APPROVED'
          ? replacement.toISOString()
          : undefined,
      );
      if (decided) done += 1;
    }
    const ok = done === deciding.items.length;
    if (deciding.items.length > 1)
      setBulkResult(
        ok
          ? `${done} request${done === 1 ? '' : 's'} ${deciding.status === 'APPROVED' ? 'approved' : 'rejected'}.`
          : `${done} of ${deciding.items.length} decided; the rest could not be — see the message above.`,
      );
    if (done > 0) setSelected(new Set());
    // A refused or failed decision keeps the dialog open with the error beside it.
    if (ok) {
      setComment('');
      setCheckOutDate('');
      setCheckOutTime('');
      setDeciding(null);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {bulkResult && (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
            role="status"
          >
            {bulkResult}
          </p>
        )}

        {selectable.length > 1 && !inbox.loading && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                aria-label="Select every request you can decide"
                checked={chosen.length > 0 && chosen.length === selectable.length}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? new Set(selectable.map(keyOf)) : new Set())
                }
              />
              {chosen.length ? `${chosen.length} selected` : 'Select all'}
            </label>
            {chosen.length > 0 && (
              <div className="flex gap-2">
                <Button
                  disabled={inbox.saving}
                  onClick={() => openDecision(chosen, 'REJECTED')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reject {chosen.length}
                </Button>
                <Button
                  disabled={inbox.saving}
                  onClick={() => openDecision(chosen, 'APPROVED')}
                  size="sm"
                  type="button"
                >
                  Approve {chosen.length}
                </Button>
              </div>
            )}
          </div>
        )}

        {inbox.saveError && (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {inbox.saveError}
          </p>
        )}

        {inbox.loading && (
          <p className="py-10 text-center text-xs text-muted-foreground" role="status">
            Loading approvals...
          </p>
        )}

        {!inbox.loading && inbox.error && (
          <div
            className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
            role="alert"
          >
            <p className="text-sm font-bold text-foreground">Could not load approvals</p>
            <p className="mt-1 text-xs text-muted-foreground">{inbox.error}</p>
            <Button
              className="mt-3"
              onClick={() => void inbox.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        )}

        {!inbox.loading && !inbox.error && inbox.items.length === 0 && (
          <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-bold text-foreground">Nothing awaiting your decision</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Leave requests, attendance corrections and holiday check-ins routed to you appear
              here.
            </p>
          </div>
        )}

        {!inbox.loading &&
          !inbox.error &&
          inbox.items.map((item) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              key={`${item.domain}-${item.id}`}
            >
              <div className="flex min-w-0 items-start gap-3">
                {selectable.length > 1 &&
                  item.domain !== 'HOLIDAY_CHECK_IN' &&
                  inbox.canDecide(item) && (
                    <Checkbox
                      aria-label={`Select ${item.title}`}
                      checked={selected.has(keyOf(item))}
                      className="mt-0.5"
                      onCheckedChange={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(keyOf(item));
                          else next.delete(keyOf(item));
                          return next;
                        })
                      }
                    />
                  )}
                <div className="min-w-0">
                  {item.requester && (
                    <p className="text-[11px] font-semibold text-primary">{item.requester}</p>
                  )}
                  <p className="text-xs font-bold text-foreground">{item.title}</p>
                  <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {item.submittedAt ? formatDate(item.submittedAt) : 'pending'}
                </Badge>
                {item.domain === 'HOLIDAY_CHECK_IN' && inbox.canDecide(item) ? (
                  <Button
                    disabled={inbox.saving}
                    onClick={() => {
                      inbox.dismissError();
                      setReviewing(item);
                    }}
                    size="sm"
                    type="button"
                  >
                    Review
                  </Button>
                ) : inbox.canDecide(item) ? (
                  <>
                    <Button
                      disabled={inbox.saving}
                      onClick={() => openDecision([item], 'REJECTED')}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Reject
                    </Button>
                    <Button
                      disabled={inbox.saving}
                      onClick={() => openDecision([item], 'APPROVED')}
                      size="sm"
                      type="button"
                    >
                      Approve
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">You cannot decide this</span>
                )}
              </div>
            </div>
          ))}
      </div>

      <HolidayReviewDialog item={reviewing} inbox={inbox} onClose={() => setReviewing(null)} />

      <Dialog onOpenChange={(open) => !open && setDeciding(null)} open={deciding !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {deciding?.status === 'APPROVED' ? 'Approve' : 'Reject'}{' '}
            {single ? 'this request' : `${deciding?.items.length ?? 0} requests`}
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The comment is recorded against the decision and shown to the requester.
          </p>
          <div className="mt-4 space-y-3">
            {proposed && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-[11px] text-foreground">
                  {single?.autoClosed
                    ? 'This day was closed automatically because no check-out was recorded.'
                    : 'This request adds the day’s check-out.'}{' '}
                  Approving records{' '}
                  <span className="font-mono font-semibold">
                    {proposed.toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>{' '}
                  as the check-out. Enter the real time instead if you know it.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block text-[11px]" htmlFor="decision-check-out-date">
                      Date
                    </Label>
                    <DatePicker
                      disabled={inbox.saving}
                      id="decision-check-out-date"
                      onChange={setCheckOutDate}
                      value={checkOutDate}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-[11px]" htmlFor="decision-check-out-time">
                      Time
                    </Label>
                    <TimePicker
                      disabled={inbox.saving}
                      id="decision-check-out-time"
                      onChange={setCheckOutTime}
                      value={checkOutTime}
                      placeholder="Select time"
                    />
                  </div>
                </div>
                {(checkOutDate || checkOutTime) && !replacement && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Enter both a date and a time to replace the proposed check-out.
                  </p>
                )}
              </div>
            )}
            <Label className="block" htmlFor="decision-comment">
              Comment
            </Label>
            <Textarea
              disabled={inbox.saving}
              id="decision-comment"
              onChange={(event) => setComment(event.target.value)}
              value={comment}
            />
            <div className="flex justify-end gap-2">
              <Button
                disabled={inbox.saving}
                onClick={() => setDeciding(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={inbox.saving || comment.trim().length < 2}
                onClick={() => void confirm()}
                type="button"
                variant={deciding?.status === 'APPROVED' ? 'default' : 'destructive'}
              >
                {inbox.saving
                  ? 'Recording...'
                  : deciding?.status === 'APPROVED'
                    ? 'Approve'
                    : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
