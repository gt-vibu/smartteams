'use client';

import React, { useState } from 'react';
import { Badge, Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
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
    item: ApprovalInboxItem;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [comment, setComment] = useState('');
  const [reviewing, setReviewing] = useState<ApprovalInboxItem | null>(null);

  const confirm = async () => {
    if (!deciding) return;
    const ok = await inbox.decide(deciding.item, deciding.status, comment.trim());
    // A refused or failed decision keeps the dialog open with the error beside it.
    if (ok) {
      setComment('');
      setDeciding(null);
    }
  };

  return (
    <>
      <div className="space-y-3">
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
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{item.title}</p>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {item.detail}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {item.submittedAt ? item.submittedAt.slice(0, 10) : 'pending'}
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
                      onClick={() => setDeciding({ item, status: 'REJECTED' })}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Reject
                    </Button>
                    <Button
                      disabled={inbox.saving}
                      onClick={() => setDeciding({ item, status: 'APPROVED' })}
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
            {deciding?.status === 'APPROVED' ? 'Approve' : 'Reject'} this request
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The comment is recorded against the decision and shown to the requester.
          </p>
          <div className="mt-4 space-y-3">
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
