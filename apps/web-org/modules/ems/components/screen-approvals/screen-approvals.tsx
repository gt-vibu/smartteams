'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Button } from '@smarteam/ui';
import { useApprovalInbox } from '../../hooks/use-approval-inbox';
import { ApprovalPolicyBuilder } from './approval-policy-builder';
import { ApprovalQueue } from './approval-queue';
import { DelegationPanel } from './delegation-panel';
import { ApprovalFollowUpCard } from './approval-follow-up-card';
import { PageShell } from '../layout/page-shell';
import { useAuth } from '../../hooks/use-auth';

type View = 'queue' | 'cover' | 'policies';

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
  const { workspaceContext, hasPermission } = useAuth();
  const admin = workspaceContext === 'ADMIN';
  // Only the tabs this person can use in this workspace. Someone's own workspace has their queue
  // and their cover; routing policies, and cover for others, belong to the admin workspace.
  const views: Array<{ id: View; label: string }> = [
    { id: 'queue', label: `My approvals${inbox.items.length ? ` (${inbox.items.length})` : ''}` },
    ...(!admin || hasPermission('approval-policies.write')
      ? [{ id: 'cover' as const, label: 'Delegation' }]
      : []),
    ...(admin && hasPermission('approval-policies.read')
      ? [{ id: 'policies' as const, label: 'Approval workflows' }]
      : []),
  ];
  const [chosen, setView] = useState<View>('queue');
  const view = views.some((entry) => entry.id === chosen) ? chosen : 'queue';

  return (
    <PageShell>
      <ScreenHeader icon={CheckCircle2} title="Approvals" tone="success" />
      <div className="flex items-center gap-4 overflow-x-auto border-b border-border pb-2">
        {views.map((entry) => (
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

      {view === 'policies' && (
        <>
          <ApprovalFollowUpCard />
          <ApprovalPolicyBuilder />
        </>
      )}

      {view === 'queue' && <ApprovalQueue inbox={inbox} />}

      {view === 'cover' && <DelegationPanel admin={admin} />}
    </PageShell>
  );
}
