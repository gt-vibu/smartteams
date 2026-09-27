import React, { useRef } from 'react';
import { Button, useFocusTrap } from '@smarteam/ui';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import { MissingCheckOutForm } from '../common/missing-check-out-form';
import { HolidayConflictSection } from '../common/holiday-conflict-section';
import { CorrectionForm, type CorrectionTimes } from './correction-form';

/** Where a punch came from, in words: the internal source codes mean nothing to an employee. */
const PUNCH_SOURCE: Record<string, string> = {
  NATIVE: 'Self',
  FEDERATION: 'Integration',
  ADMIN_CORRECTION: 'Corrected',
  IMPORT: 'Imported',
};

interface AttendanceDetailDrawerProps {
  row: AttendanceTableRow | null;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Sends the correction. Resolving means the server accepted it; rejecting carries the reason to
   * show. Returning `void` is what let the drawer treat a rejected request as a success.
   */
  onSubmitRegularization?: (
    recordId: string,
    reason: string,
    times?: CorrectionTimes,
  ) => Promise<unknown>;
  /** Asks for a missing check-out to be added; same resolve/reject contract as above. */
  onSubmitMissingCheckOut?: (
    recordId: string,
    checkOutAt: string,
    reason: string,
  ) => Promise<unknown>;
  /** Explains a check-in on an approved optional holiday; same contract. */
  onExplainHolidayCheckIn?: (recordId: string, reason: string, comment: string) => Promise<unknown>;
}

export function AttendanceDetailDrawer({
  row,
  isOpen,
  onClose,
  onSubmitRegularization,
  onSubmitMissingCheckOut,
  onExplainHolidayCheckIn,
}: AttendanceDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, panelRef, onClose);

  if (!isOpen || !row) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-In Panel. Full width on a phone: the panel used to be `w-screen` inside a wrapper
          padded 40px on the left, so it began 40px in and ran 40px past the right edge — where
          `overflow-hidden` cut off everything right-aligned, the close button included. */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-full sm:w-auto sm:pl-10">
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="attendance-details-title"
          tabIndex={-1}
          className="flex w-full max-w-full flex-col justify-between border-l border-border bg-card shadow-2xl sm:w-screen sm:max-w-md"
        >
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
            <div>
              <h2
                id="attendance-details-title"
                className="!m-0 !text-sm !font-bold !text-foreground"
              >
                Attendance Details
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{row.date}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close attendance details"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
            <div className="bg-muted/40 border border-border rounded p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Shift</span>
                <span className="font-semibold text-foreground">{row.shift}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Status</span>
                <span className="font-semibold text-foreground">{row.status}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Total Worked</span>
                <span className="font-mono font-bold text-foreground">
                  {/* The same "9h 10m" form as the payable hours beside it, not "09:10 Hrs". */}
                  {row.totalHours && row.totalHours !== '-'
                    ? row.totalHours.replace(/^0?(\d+):0?(\d+)$/, '$1h $2m')
                    : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Payable Hours</span>
                <span className="font-mono font-semibold text-foreground">{row.payableHours}</span>
              </div>
            </div>

            {/* Clock Event Telemetry Logs */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                Punches / Clock Events
              </div>
              {row.punches && row.punches.length > 0 ? (
                <div className="space-y-2">
                  {row.punches.map((p, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded border border-border bg-card flex items-center justify-between text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-semibold text-foreground">
                          {p.type === 'IN' ? 'Check In' : 'Check Out'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground font-mono">
                        <span>{p.time}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-sans text-muted-foreground">
                          {PUNCH_SOURCE[p.source] ?? p.source}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic py-2">
                  No clock events recorded for this date.
                </div>
              )}
            </div>

            {row.holidayConflict && (
              <HolidayConflictSection
                conflict={row.holidayConflict}
                attendanceId={row.id}
                onExplain={onExplainHolidayCheckIn}
              />
            )}

            {/* A day that ended on a check-in gets its check-out added; any other day's punches are
                corrected. Two different requests, so two clearly named forms. */}
            {row.openCheckInAt && onSubmitMissingCheckOut ? (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground mb-1.5">
                  Add missing check-out
                </div>
                <MissingCheckOutForm
                  key={row.id}
                  checkInAt={row.openCheckInAt}
                  onSubmit={(checkOutAt, missingReason) =>
                    onSubmitMissingCheckOut(row.id, checkOutAt, missingReason)
                  }
                />
              </div>
            ) : (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground mb-1.5">
                  Correct an existing punch
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5">
                  Ask for the day to be corrected; it goes to whoever approves attendance
                  corrections.
                </p>
                {onSubmitRegularization ? (
                  <CorrectionForm
                    checkInAt={row.checkInAt}
                    checkOutAt={row.checkOutAt}
                    key={row.id}
                    onDone={onClose}
                    onSubmit={(reason, times) =>
                      times
                        ? onSubmitRegularization(row.id, reason, times)
                        : onSubmitRegularization(row.id, reason)
                    }
                    workDate={row.workDate}
                  />
                ) : null}
              </div>
            )}
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
