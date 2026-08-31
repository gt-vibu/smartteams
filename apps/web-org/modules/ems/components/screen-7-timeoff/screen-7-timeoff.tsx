'use client';

import React, { useState } from 'react';
import { LeaveToolbar } from './leave-toolbar';
import { LeaveBalanceCards } from './leave-balance-cards';
import { LeaveApplicationsTable } from './leave-applications-table';
import { ApplyLeaveModal } from './apply-leave-modal';
import { useLeave } from '../../hooks/use-leave';
import type { ApplyLeaveFormData } from '../../types/leave.types';

export function Screen7TimeOff() {
  const [activeSubTab, setActiveSubTab] = useState('Leave Summary');
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const { balances, applications, applyLeave } = useLeave();

  const handleApplyLeave = (data: ApplyLeaveFormData) => {
    applyLeave(data);
  };

  return (
    <div className="w-full flex flex-col">
      {/* 1. Sub-Tabs & Actions Toolbar — sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-muted">
        <LeaveToolbar
          activeSubTab={activeSubTab}
          onSelectSubTab={setActiveSubTab}
          onOpenApplyLeave={() => setIsApplyModalOpen(true)}
          yearLabel="2026"
        />
      </div>

      {/* 2. Scrollable content below toolbar */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 space-y-4 pt-3.5">
        {/* Leave Balance Summary Cards */}
        <LeaveBalanceCards balances={balances} />

        {/* Leave Applications History & Status Table */}
        {applications.length > 0 ? (
          <LeaveApplicationsTable applications={applications} />
        ) : (
          <div className="bg-white rounded-[6px] border border-slate-200/90 p-8 text-center space-y-2 shadow-xs">
            <div className="text-sm font-bold text-slate-700">No leave applications found</div>
            <p className="text-xs text-slate-500">
              Click "Apply Leave" above to submit a new time-off request.
            </p>
          </div>
        )}
      </div>

      {/* Apply Leave Modal */}
      <ApplyLeaveModal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        onSubmitLeave={handleApplyLeave}
      />
    </div>
  );
}
