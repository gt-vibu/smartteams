'use client';
import { ApprovalBatchHistory } from './approval-batch-history';
import { ApprovalAnalyticsPanel } from './approval-analytics-panel';
import { LeaveCancellationsPanel } from './leave-cancellations-panel';

import { Button } from '@smarteam/ui';
import { CheckCircle2, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useApprovalInbox } from '../../hooks/use-approval-inbox';
import { useAuth } from '../../hooks/use-auth';
import { ScreenHeader } from '../common/screen-header';
import { PageShell } from '../layout/page-shell';
import { ApprovalExceptionsPanel } from './approval-exceptions-panel';
import { ApprovalFollowUpCard } from './approval-follow-up-card';
import { ApprovalPolicyBuilder } from './approval-policy-builder';
import { ApprovalQueue } from './approval-queue';
import { DelegationPanel } from './delegation-panel';

type View = 'queue' | 'cover' | 'policies' | 'exceptions' | 'cancellations' | 'analytics';

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
    ...(admin && hasPermission('leave.requests.read.all') && hasPermission('leave.requests.decide')
      ? [{ id: 'cancellations' as const, label: 'Leave cancellations' }]
      : []),
    ...(admin && hasPermission('approval-policies.read')
      ? [{ id: 'analytics' as const, label: 'Workload' }]
      : []),
    { id: 'queue', label: `My approvals${inbox.items.length ? ` (${inbox.items.length})` : ''}` },
    ...(!admin || hasPermission('approval-policies.write')
      ? [{ id: 'cover' as const, label: 'Delegation' }]
      : []),
    ...(admin && hasPermission('approval-policies.read')
      ? [{ id: 'policies' as const, label: 'Approval workflows' }]
      : []),
    ...(admin &&
    hasPermission('approval-policies.write') &&
    (hasPermission('leave.requests.read.all') || hasPermission('attendance.read.all'))
      ? [{ id: 'exceptions' as const, label: 'Routing exceptions' }]
      : []),
  ];
  const [chosen, setView] = useState<View>('queue');
  const view = views.some((entry) => entry.id === chosen) ? chosen : 'queue';

  return (
    <PageShell>
      <ScreenHeader description="Review requests and manage approval workflows." icon={CheckCircle2} title="Approvals" tone="success" />
      <div className="relative">
        <div
          aria-label="Approval sections; swipe horizontally for more"
          className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-border pb-2"
          role="group"
        >
          {views.map((entry) => (
            <Button
              aria-pressed={view === entry.id}
              className={`shrink-0 whitespace-nowrap rounded-none pb-1 text-xs font-semibold ${
                view === entry.id
                  ? 'border-b-2 border-foreground font-bold text-foreground'
                  : 'text-muted-foreground'
              }`}
              key={entry.id}
              data-approval-view={entry.id}
              onClick={() => setView(entry.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </div>

      {view === 'policies' && (
        <>
          <ApprovalFollowUpCard />
          <ApprovalPolicyBuilder />
        </>
      )}

      {view === 'analytics' && (
        <>
          {admin && hasPermission('approval-policies.write') && (
            <section className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Automatic approvals</h2>
                <p className="max-w-2xl text-xs text-muted-foreground">
                  Choose Manual, Automatic, or Conditional for leave and attendance policies.
                  Requests outside the rules still go to their assigned approvers.
                </p>
              </div>
              <Button
                className="shrink-0"
                onClick={() => setView('policies')}
                size="sm"
                type="button"
                variant="outline"
              >
                <Settings2 aria-hidden="true" className="mr-1.5 size-3.5" />
                Configure automation
              </Button>
            </section>
          )}
          <ApprovalAnalyticsPanel />
          <ApprovalBatchHistory />
        </>
      )}
      {view === 'queue' && <ApprovalQueue inbox={inbox} />}
      {view === 'cancellations' && <LeaveCancellationsPanel />}
      {view === 'exceptions' && <ApprovalExceptionsPanel />}

      {view === 'cover' && <DelegationPanel admin={admin} />}
    </PageShell>
  );
}
