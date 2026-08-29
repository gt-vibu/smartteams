'use client';

import React, { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Tabs,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Label,
  Textarea,
} from '@smarteam/ui';
import approvalsFixture from '../../data/fixtures/approvals.json';
import { ApprovalPolicyBuilder } from './approval-policy-builder';

export function ScreenApprovals() {
  const [mainView, setMainView] = useState<'queue' | 'policies'>('queue');
  const [activeFilter, setActiveFilter] = useState<
    'ALL' | 'LEAVE_REQUEST' | 'TIMESHEET' | 'ATTENDANCE_CORRECTION' | 'COMPLETED'
  >('ALL');
  const [pendingList, setPendingList] = useState(approvalsFixture.pendingApprovals);
  const [completedList, setCompletedList] = useState(approvalsFixture.completedApprovals);

  // Rejection Reason Modal State (shadcn)
  const [rejectingItem, setRejectingItem] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleApprove = (id: string) => {
    const item = pendingList.find((p) => p.id === id);
    if (!item) return;

    setPendingList((prev) => prev.filter((p) => p.id !== id));
    setCompletedList((prev) => [
      {
        ...item,
        status: 'APPROVED',
        actionDate: 'Just now',
      } as any,
      ...prev,
    ]);
    showToast(
      `Request by ${(item as any).applicantName || (item as any).employeeName || 'staff'} approved.`,
    );
  };

  const handleInitiateReject = (item: any) => {
    setRejectingItem(item);
    setRejectReason('');
    setRejectError(null);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError('Please provide a specific reason for rejection.');
      return;
    }

    if (!rejectingItem) return;

    const id = rejectingItem.id;
    setPendingList((prev) => prev.filter((p) => p.id !== id));
    setCompletedList((prev) => [
      {
        ...rejectingItem,
        status: 'REJECTED',
        rejectionReason: rejectReason.trim(),
        actionDate: 'Just now',
      } as any,
      ...prev,
    ]);
    showToast(`Request rejected with notification sent to applicant.`);
    setRejectingItem(null);
    setRejectReason('');
    setRejectError(null);
  };

  const displayedList =
    activeFilter === 'COMPLETED'
      ? completedList
      : pendingList.filter((item) => {
          if (activeFilter === 'ALL') return true;
          return item.domain === activeFilter;
        });

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Governance & Approval Engine
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Operational approval queues, multi-level hierarchy routing, and enterprise workflow
            policies.
          </p>
        </div>

        <Tabs value={mainView} onValueChange={(v: any) => setMainView(v)}>
          <TabsList className="grid grid-cols-2 w-64 bg-slate-100 dark:bg-[#161B22] p-0.5 rounded-lg">
            <TabsTrigger value="queue" className="text-xs font-semibold">
              Approval Queue ({pendingList.length})
            </TabsTrigger>
            <TabsTrigger value="policies" className="text-xs font-semibold">
              Routing Policies
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mainView === 'queue' ? (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'ALL', label: `All Pending (${pendingList.length})` },
              { id: 'LEAVE_REQUEST', label: 'Leave Requests' },
              { id: 'TIMESHEET', label: 'Timesheets' },
              { id: 'ATTENDANCE_CORRECTION', label: 'Attendance Regularization' },
              { id: 'COMPLETED', label: `History (${completedList.length})` },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={activeFilter === tab.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(tab.id as any)}
                className="text-xs"
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Clean Requests Table */}
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">
                  {activeFilter === 'COMPLETED'
                    ? 'Approval Audit History'
                    : 'Pending Approvals Queue'}
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Items requiring managerial authorization or escalated under configured SLAs.
                </CardDescription>
              </div>
              <Badge variant="secondary">{displayedList.length} items</Badge>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Requester</TableHead>
                  <TableHead>Request Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Current Approver</TableHead>
                  <TableHead>Status / SLA</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      No items matching this queue filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedList.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {(item as any).applicantName ||
                            (item as any).employeeName ||
                            'Staff Member'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {(item as any).applicantRole || (item as any).jobTitle || 'Engineering'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="sky">{item.domain.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs text-slate-700 dark:text-slate-300">
                        <div className="truncate">
                          {(item as any).reason ||
                            (item as any).title ||
                            (item as any).description ||
                            'Pending managerial review'}
                        </div>
                        {(item as any).rejectionReason && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 flex items-center gap-1 font-medium">
                            <span>Reason:</span>
                            <span className="italic">{(item as any).rejectionReason}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] text-slate-500">
                        {(item as any).submittedDate || 'Today'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {(item as any).currentApprover || 'Reporting Manager'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === 'APPROVED'
                              ? 'success'
                              : item.status === 'REJECTED'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleInitiateReject(item)}
                              className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(item.id)}
                              className="text-xs"
                            >
                              Approve
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {(item as any).actionDate || 'Resolved'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      ) : (
        <ApprovalPolicyBuilder />
      )}

      {/* Reject Reason Modal (shadcn Dialog) */}
      {rejectingItem && (
        <Dialog open={Boolean(rejectingItem)} onOpenChange={() => setRejectingItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs font-bold shrink-0">
                  ✕
                </span>
                <DialogTitle>Reject Request</DialogTitle>
              </div>
              <DialogDescription>
                Provide a reason for rejecting this{' '}
                {rejectingItem.domain.replace('_', ' ').toLowerCase()} for{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {(rejectingItem as any).applicantName ||
                    (rejectingItem as any).employeeName ||
                    'the applicant'}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmReject} className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="rejection-reason-input" className="text-xs font-semibold">
                  Reason for Rejection <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id="rejection-reason-input"
                  name="rejectionReason"
                  placeholder="Explain why this request is being rejected (e.g., Incomplete documentation, team coverage conflict, revision required)..."
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectError) setRejectError(null);
                  }}
                  rows={4}
                  className="text-xs"
                  required
                  autoFocus
                />
                {rejectError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    {rejectError}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectingItem(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" size="sm">
                  Confirm Rejection
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
