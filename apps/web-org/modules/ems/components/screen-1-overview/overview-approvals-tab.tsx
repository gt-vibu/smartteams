'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import { useAuth } from '../../hooks/use-auth';

interface ApprovalItem {
  id: string;
  type: 'LEAVE' | 'ATTENDANCE_REGULARIZATION' | 'TIMESHEET';
  requesterName: string;
  requesterRole: string;
  date: string;
  details: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export function OverviewApprovalsTab() {
  const { hasExplicitPermission } = useAuth();

  const isManagerApprover =
    hasExplicitPermission('leave.approve') ||
    hasExplicitPermission('timesheets.decide') ||
    hasExplicitPermission('attendance.approve');

  const [approvals, setApprovals] = useState<ApprovalItem[]>([
    {
      id: 'appr-1',
      type: 'ATTENDANCE_REGULARIZATION',
      requesterName: 'Mithun Gowda H',
      requesterRole: 'Software Engineer',
      date: 'Aug 24, 2026',
      details:
        'Missed Check-out punch due to offsite network maintenance. Requested payable hours: 8.0 hrs.',
      status: 'PENDING',
    },
    {
      id: 'appr-2',
      type: 'LEAVE',
      requesterName: 'Shailesh Thipse',
      requesterRole: 'Software Engineer',
      date: 'Aug 28 - Aug 29, 2026 (2 Days)',
      details: 'Casual Leave request for urgent personal commitment.',
      status: 'PENDING',
    },
    {
      id: 'appr-3',
      type: 'TIMESHEET',
      requesterName: 'Tejasri Bonala',
      requesterRole: 'QA Analyst',
      date: 'Sprint 24 (40.0 Hrs)',
      details: 'Weekly timesheet submission for Luxasia 2026 sprint activities.',
      status: 'PENDING',
    },
  ]);

  if (!isManagerApprover) {
    return (
      <div className="bg-card rounded-[6px] border border-border/90 shadow-2xs p-8 text-center space-y-2">
        <div className="text-2xl">📋</div>
        <h4 className="text-xs font-bold text-foreground">No Approvals Assigned</h4>
        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
          You are currently in Individual Contributor mode. Managerial approvals for team
          timesheets, leave requests, and attendance corrections are assigned exclusively to
          designated reporting managers.
        </p>
      </div>
    );
  }

  const handleAction = (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    setApprovals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item)),
    );
  };

  const pendingCount = approvals.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="bg-card rounded-[6px] border border-border/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
        <div>
          <h3 className="!text-xs !font-bold !text-foreground !m-0">
            Pending Team Approvals & Action Requests
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Review and take action on direct reports' attendance corrections, leave requests, and
            timesheets.
          </p>
        </div>
        <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded border border-sky-200">
          {pendingCount} Pending
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {approvals.map((item) => (
          <div
            key={item.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    item.type === 'LEAVE'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : item.type === 'ATTENDANCE_REGULARIZATION'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200'
                  }`}
                >
                  {item.type.replace('_', ' ')}
                </span>
                <span className="text-xs font-bold text-foreground">{item.requesterName}</span>
                <span className="text-[11px] text-muted-foreground">({item.requesterRole})</span>
              </div>
              <div className="text-xs text-foreground font-medium">{item.details}</div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Date / Duration: {item.date}
              </div>
            </div>

            {/* Status / Action Buttons */}
            <div className="shrink-0 flex items-center gap-2">
              {item.status === 'PENDING' ? (
                <>
                  <Button
                    onClick={() => handleAction(item.id, 'APPROVED')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shadow-2xs transition-colors cursor-pointer"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleAction(item.id, 'REJECTED')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded shadow-2xs transition-colors cursor-pointer"
                  >
                    Reject
                  </Button>
                </>
              ) : item.status === 'APPROVED' ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded border border-emerald-200">
                  ✓ Approved
                </span>
              ) : (
                <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1 rounded border border-rose-200">
                  ✕ Rejected
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
