'use client';

import React from 'react';
import { useApprovalInbox } from '../../hooks/use-approval-inbox';
import { ApprovalQueue } from '../screen-approvals/approval-queue';

/**
 * Home's Approvals tab: the same server inboxes as the Approvals screen.
 *
 * It used to hold three invented requests in component state, and approving one changed only that
 * state — the badge said "Approved" while the real request stayed pending on the server. The tab
 * is offered only to someone who decides approvals (see `useIsManagerApprover`), and every item and
 * decision here now comes from, and goes to, the API.
 */
export function OverviewApprovalsTab() {
  const inbox = useApprovalInbox();
  return <ApprovalQueue inbox={inbox} />;
}
