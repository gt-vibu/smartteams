import React, { useState } from 'react';
import { CalendarDayItem } from '../../types/calendar.types';

interface CalendarDetailDrawerProps {
  day: CalendarDayItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarDetailDrawer({
  day,
  isOpen,
  onClose,
}: CalendarDetailDrawerProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !day) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-In Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div>
              <h2 className="!text-sm !font-bold !text-slate-900 !m-0">
                Shift & Day Schedule
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {day.date}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-5 flex-1 overflow-y-auto">
            {/* Shift & Status KPI Strip */}
            <div className="bg-slate-50 border border-slate-200 rounded p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Shift</span>
                <span className="font-semibold text-slate-800">
                  {day.shiftName || 'General Shift (10:00 AM - 6:00 PM)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Status</span>
                <span className="font-semibold text-slate-800">
                  {day.holidayName ? day.holidayName : day.dayStatus}
                </span>
              </div>
              {day.hoursLabel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Recorded Hours</span>
                  <span className="font-mono font-bold text-slate-900">{day.hoursLabel}</span>
                </div>
              )}
            </div>

            {/* Clock Event Telemetry Logs */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Punches / Clock Events
              </div>
              {day.punches && day.punches.length > 0 ? (
                <div className="space-y-2">
                  {day.punches.map((p, i) => (
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

            {/* Request Regularization */}
            {day.dayStatus === 'PRESENT' && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-800 mb-1.5">
                  Request Regularization
                </div>
                <p className="text-[11px] text-slate-500 mb-2.5">
                  Submit an attendance correction request for your reporting manager to review.
                </p>
                {submitted ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-medium">
                    ✓ Regularization request submitted successfully.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for regularization..."
                      className="w-full text-xs p-2.5 border border-slate-200 rounded focus:ring-1 focus:ring-sky-500 focus:outline-none bg-slate-50 focus:bg-white"
                    />
                    <button
                      disabled={reason.length < 5}
                      onClick={() => setSubmitted(true)}
                      className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white transition-colors"
                    >
                      Submit Correction Request
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-white transition-colors shadow-2xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
