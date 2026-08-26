import React, { useState } from 'react';
import { ApplyLeaveFormData } from '../../types/leave.types';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitLeave?: (data: ApplyLeaveFormData) => void;
}

export function ApplyLeaveModal({
  isOpen,
  onClose,
  onSubmitLeave,
}: ApplyLeaveModalProps) {
  const [leaveTypeId, setLeaveTypeId] = useState('lt_cl');
  const [startDate, setStartDate] = useState('2026-09-12');
  const [endDate, setEndDate] = useState('2026-09-14');
  const [reason, setReason] = useState('');
  const [teamNotify, setTeamNotify] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      />

      {/* Centered Modal Card */}
      <div className="relative bg-white rounded-[8px] shadow-2xl border border-slate-200 w-full max-w-lg z-10 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="!text-sm !font-bold !text-slate-900 !m-0">
                Apply Leave
              </h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Submit time-off request for manager approval
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Leave Type Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Leave Type <span className="text-rose-500">*</span>
            </label>
            <select
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors cursor-pointer"
            >
              <option value="lt_cl">Casual Leave (CL) — 6.5 Days Remaining</option>
              <option value="lt_el">Earned / Privilege Leave (EL) — 14.0 Days Remaining</option>
              <option value="lt_sl">Sick Leave (SL) — 8.0 Days Remaining</option>
              <option value="lt_comp">Compensatory Off (COMP) — 2.0 Days Available</option>
            </select>
          </div>

          {/* Date Range: From / To */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                From Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                To Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
              />
            </div>
          </div>

          {/* Duration Summary Tag */}
          <div className="bg-sky-50/70 border border-sky-100 rounded px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-sky-800 font-medium">Applied Duration:</span>
            <span className="font-bold text-sky-900 font-mono">3 Working Days</span>
          </div>

          {/* Reason Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Leave <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the reason for your time-off request..."
              required
              className="w-full bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>

          {/* Team Notify */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notify Colleagues (Optional)
            </label>
            <input
              type="text"
              value={teamNotify}
              onChange={(e) => setTeamNotify(e.target.value)}
              placeholder="e.g. Ranjith Kumar C, Shailesh Thipse"
              className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>

          {/* Submission Feedback */}
          {isSubmitted && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-semibold flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Leave request submitted successfully to your manager!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white rounded shadow-xs transition-colors"
            >
              Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
