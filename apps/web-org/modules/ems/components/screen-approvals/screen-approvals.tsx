'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Badge, Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import { useApprovalInbox, type ApprovalInboxItem } from '../../hooks/use-approval-inbox';
import { ApprovalPolicyBuilder } from './approval-policy-builder';

type View = 'queue' | 'policies';

/**
 * Approvals.
 *
 * Replaces a queue backed by `approvals.json`, where approving an item removed a row from a
 * browser array — the request stayed pending on the server, and the requester never heard back.
 *
 * There is no unified approvals API. The queue is composed from the two inboxes that exist —
 * leave requests and attendance corrections — each keyed on the signed-in user by the server.
 * Timesheet and payroll approvals have no inbox route and are therefore absent rather than
 * mocked, and no decision is taken here that the server would not authorise.
 */
export function ScreenApprovals() {
  const inbox = useApprovalInbox();
  const [view, setView] = useState<View>('queue');
  const [deciding, setDeciding] = useState<{
    item: ApprovalInboxItem;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [comment, setComment] = useState('');

  const confirm = async () => {
    if (!deciding) return;
    const ok = await inbox.decide(deciding.item, deciding.status, comment.trim());
    if (ok) {
      setComment('');
      setDeciding(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        description="Decisions routed to you, and the policies that route them."
        icon={CheckCircle2}
        title="Approvals"
        tone="success"
      />
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {(
          [
            {
              id: 'queue',
              label: `Awaiting me${inbox.items.length ? ` (${inbox.items.length})` : ''}`,
            },
            { id: 'policies', label: 'Routing policies' },
          ] as Array<{ id: View; label: string }>
        ).map((entry) => (
          <Button
            className={`rounded-none pb-1 text-xs font-semibold ${
              view === entry.id
                ? 'border-b-2 border-foreground font-bold text-foreground'
                : 'text-muted-foreground'
            }`}
            key={entry.id}
            onClick={() => setView(entry.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {view === 'policies' && <ApprovalPolicyBuilder />}

      {view === 'queue' && (
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
            <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
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
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <p className="text-sm font-bold text-foreground">Nothing awaiting your decision</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Leave requests and attendance corrections routed to you appear here.
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
                <div>
                  <p className="text-xs font-bold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {item.submittedAt ? item.submittedAt.slice(0, 10) : 'pending'}
                  </Badge>
                  {inbox.canDecide(item) ? (
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
                    <span className="text-[11px] text-muted-foreground">
                      You cannot decide this
                    </span>
                  )}
                </div>
              </div>
            ))}

          <p className="text-[11px] text-muted-foreground">
            Timesheet and payroll approvals are not listed: neither exposes an inbox route.
          </p>
        </div>
      )}

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
              >
                {inbox.saving ? 'Recording...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
