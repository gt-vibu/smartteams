'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Button } from '@smarteam/ui';
import { useApprovalInbox } from '../../hooks/use-approval-inbox';
import { ApprovalPolicyBuilder } from './approval-policy-builder';
import { ApprovalQueue } from './approval-queue';
import { PageShell } from '../layout/page-shell';

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

  return (
    <PageShell>
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

      {view === 'queue' && <ApprovalQueue inbox={inbox} />}
    </PageShell>
  );
}
