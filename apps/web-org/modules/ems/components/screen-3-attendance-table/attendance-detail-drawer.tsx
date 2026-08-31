import React, { useRef, useState } from 'react';
import { Button, Textarea, useFocusTrap } from '@smarteam/ui';
import type { AttendanceTableRow } from '../../types/attendance-table.types';

interface AttendanceDetailDrawerProps {
  row: AttendanceTableRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitRegularization?: (recordId: string, reason: string) => void;
}

export function AttendanceDetailDrawer({
  row,
  isOpen,
  onClose,
  onSubmitRegularization,
}: AttendanceDetailDrawerProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, panelRef, onClose);

  if (!isOpen || !row) return null;

  const handleSubmitRegularization = () => {
    onSubmitRegularization?.(row.id, reason);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-In Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="attendance-details-title"
          tabIndex={-1}
          className="flex w-screen max-w-md flex-col justify-between border-l border-slate-200 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div>
              <h2
                id="attendance-details-title"
                className="!m-0 !text-sm !font-bold !text-slate-900"
              >
                Attendance Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{row.date}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close attendance details"
              onClick={onClose}
              className="h-8 w-8 text-slate-400 hover:text-slate-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-5 flex-1 overflow-y-auto">
            {/* Shift & Status KPI Strip */}
            <div className="bg-slate-50 border border-slate-200 rounded p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Shift</span>
                <span className="font-semibold text-slate-800">{row.shift}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Status</span>
                <span className="font-semibold text-slate-800">{row.status}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Total Worked</span>
                <span className="font-mono font-bold text-slate-900">
                  {row.totalHours !== '-' ? `${row.totalHours} Hrs` : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Payable Hours</span>
                <span className="font-mono font-semibold text-slate-800">
                  {row.payableHours !== '-' ? `${row.payableHours} Hrs` : '-'}
                </span>
              </div>
            </div>

            {/* Clock Event Telemetry Logs */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Punches / Clock Events
              </div>
              {row.punches && row.punches.length > 0 ? (
                <div className="space-y-2">
                  {row.punches.map((p, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded border border-slate-200 bg-white flex items-center justify-between text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-semibold text-slate-800">
                          {p.type === 'IN' ? 'Check In' : 'Check Out'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 font-mono">
                        <span>{p.time}</span>
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-sans text-slate-600">
                          {p.source}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-2">
                  No clock events recorded for this date.
                </div>
              )}
            </div>

            {/* Regularization Form */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-800 mb-1.5">Request Regularization</div>
              <p className="text-[11px] text-slate-500 mb-2.5">
                Submit an attendance correction request for your reporting manager to review.
              </p>
              {submitted ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-medium">
                  ✓ Regularization request submitted successfully (Pending approval).
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for regularization (min 10 characters)..."
                    className="bg-slate-50 focus:bg-white"
                  />
                  <Button
                    type="button"
                    disabled={reason.length < 5}
                    onClick={handleSubmitRegularization}
                    className="w-full"
                  >
                    Submit Correction Request
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-border bg-slate-50 dark:bg-card flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
