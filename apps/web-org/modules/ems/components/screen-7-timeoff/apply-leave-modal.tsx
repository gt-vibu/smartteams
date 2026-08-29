'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  Label,
  Input,
  Select,
  Textarea,
  DatePicker,
} from '@smarteam/ui';
import { ApplyLeaveFormData } from '../../types/leave.types';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitLeave?: (data: ApplyLeaveFormData) => void;
}

export function ApplyLeaveModal({ isOpen, onClose, onSubmitLeave }: ApplyLeaveModalProps) {
  const [leaveTypeId, setLeaveTypeId] = useState('lt_cl');
  const [startDate, setStartDate] = useState('2026-09-12');
  const [endDate, setEndDate] = useState('2026-09-14');
  const [reason, setReason] = useState('');
  const [teamNotify, setTeamNotify] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmitLeave) {
      onSubmitLeave({
        leaveTypeId,
        startDate,
        endDate,
        dayCount: 3,
        reason,
        teamNotify,
      });
    }
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      onClose();
    }, 900);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
              📅
            </span>
            <DialogTitle>Apply for Time Off</DialogTitle>
          </div>
          <DialogDescription>
            Submit time-off request for manager approval and roster adjustment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {/* Leave Type Select */}
          <div className="space-y-1">
            <Label htmlFor="leave-type-select">
              Leave Category <span className="text-rose-500">*</span>
            </Label>
            <Select
              id="leave-type-select"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              required
            >
              <option value="lt_cl">Casual Leave (CL) — 6.5 Days Remaining</option>
              <option value="lt_el">Earned / Privilege Leave (EL) — 14.0 Days Remaining</option>
              <option value="lt_sl">Sick Leave (SL) — 8.0 Days Remaining</option>
              <option value="lt_comp">Compensatory Off (COMP) — 2.0 Days Available</option>
            </Select>
          </div>

          {/* Date Range with shadcn DatePicker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                From Date <span className="text-rose-500">*</span>
              </Label>
              <DatePicker
                value={startDate}
                onChange={(d) => setStartDate(d)}
                placeholder="Start Date"
              />
            </div>

            <div className="space-y-1">
              <Label>
                To Date <span className="text-rose-500">*</span>
              </Label>
              <DatePicker value={endDate} onChange={(d) => setEndDate(d)} placeholder="End Date" />
            </div>
          </div>

          {/* Applied Duration Summary */}
          <div className="bg-sky-50 dark:bg-[#152438] border border-sky-200 dark:border-sky-800/60 rounded-md px-3 py-2 flex items-center justify-between text-xs text-sky-900 dark:text-sky-300">
            <span className="font-medium">Applied Duration:</span>
            <span className="font-bold font-mono">3 Working Days</span>
          </div>

          {/* Reason Textarea */}
          <div className="space-y-1">
            <Label htmlFor="leave-reason">
              Reason for Leave <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the reason for your time-off request..."
              required
            />
          </div>

          {/* Team Notify */}
          <div className="space-y-1">
            <Label htmlFor="leave-notify">Notify Colleagues (Optional)</Label>
            <Input
              id="leave-notify"
              type="text"
              value={teamNotify}
              onChange={(e) => setTeamNotify(e.target.value)}
              placeholder="e.g. Ranjith Kumar C, Shailesh Thipse"
            />
          </div>

          {/* Submission Feedback */}
          {isSubmitted && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs rounded-md font-semibold flex items-center gap-2">
              <span>✓</span>
              <span>Leave request submitted successfully to your manager!</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Submit Application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
