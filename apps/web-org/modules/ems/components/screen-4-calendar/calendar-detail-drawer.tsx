import React, { useEffect, useRef, useState } from 'react';
import { Button, Textarea, TimePicker, useFocusTrap } from '@smarteam/ui';
import { ATTENDANCE_CORRECTION_REASON_MIN_LENGTH, LIMITS } from '@smarteam/contracts';
import type { CalendarDayItem } from '../../types/calendar.types';
import { MissingCheckOutForm } from '../common/missing-check-out-form';
import { HolidayConflictSection } from '../common/holiday-conflict-section';

interface CalendarDetailDrawerProps {
  day: CalendarDayItem | null;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Raises the correction. Resolving means the server accepted it.
   *
   * The button used to call `setSubmitted(true)` and nothing else: the drawer showed a success
   * message while no request was ever made, and neither a refresh nor the approval inbox had any
   * record of it.
   */
  onSubmitCorrection?: (recordId: string, reason: string) => Promise<unknown>;
  /** Requests a missing attendance day using the employee's stated actual punch times. */
  onSubmitMissingDay?: (
    workDate: string,
    reason: string,
    checkInAt: string,
    checkOutAt?: string,
  ) => Promise<unknown>;
  /** Asks for a missing check-out to be added; same resolve/reject contract as above. */
  onSubmitMissingCheckOut?: (
    recordId: string,
    checkOutAt: string,
    reason: string,
  ) => Promise<unknown>;
  /** Explains a check-in on an approved optional holiday; same contract. */
  onExplainHolidayCheckIn?: (recordId: string, reason: string) => Promise<unknown>;
}

export function CalendarDetailDrawer({
  day,
  isOpen,
  onClose,
  onSubmitCorrection,
  onSubmitMissingDay,
  onSubmitMissingCheckOut,
  onExplainHolidayCheckIn,
}: CalendarDetailDrawerProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingCheckIn, setMissingCheckIn] = useState('');
  const [missingCheckOut, setMissingCheckOut] = useState('');
  const [activeForm, setActiveForm] = useState<'regularization' | 'missing-checkout' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, panelRef, onClose);

  useEffect(() => {
    setReason('');
    setSubmitted(false);
    setSaving(false);
    setError(null);
    setMissingCheckIn('');
    setMissingCheckOut('');
    setActiveForm(null);
  }, [day?.date, isOpen]);

  if (!isOpen || !day) return null;

  const recordId = day.attendanceRecordId;
  const handleMissingDay = async () => {
    if (!onSubmitMissingDay || saving || !missingCheckIn) return;
    const checkInAt = new Date(`${day.date}T${missingCheckIn}:00`);
    const checkOutAt = missingCheckOut ? new Date(`${day.date}T${missingCheckOut}:00`) : null;
    if (checkOutAt && checkOutAt <= checkInAt) {
      setError('Check-out must be later than check-in.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmitMissingDay(
        day.date,
        reason,
        checkInAt.toISOString(),
        checkOutAt?.toISOString(),
      );
      setSubmitted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The regularization request could not be submitted.',
      );
    } finally {
      setSaving(false);
    }
  };
  const handleSubmit = async () => {
    if (!onSubmitCorrection || !recordId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmitCorrection(recordId, reason);
      setSubmitted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The regularization request could not be submitted.',
      );
    } finally {
      setSaving(false);
    }
  };

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
          aria-labelledby="calendar-details-title"
          tabIndex={-1}
          className="flex w-full max-w-full flex-col justify-between border-l border-border bg-card shadow-2xl sm:w-screen sm:max-w-md"
        >
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
            <div>
              <h2 id="calendar-details-title" className="!m-0 !text-sm !font-bold !text-foreground">
                Shift & Day Schedule
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{day.date}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close day schedule"
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
                <span className="font-semibold text-foreground">
                  {day.shiftName ?? 'Shift not recorded'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Status</span>
                <span className="font-semibold text-foreground">
                  {day.holidayConflict
                    ? day.holidayConflict.label
                    : day.holidayName
                      ? day.holidayName
                      : day.dayStatus}
                </span>
              </div>
              {day.hoursLabel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Recorded Hours</span>
                  <span className="font-mono font-bold text-foreground">{day.hoursLabel}</span>
                </div>
              )}
            </div>

            {/* Clock Event Telemetry Logs */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                Punches / Clock Events
              </div>
              {day.punches && day.punches.length > 0 ? (
                <div className="space-y-2">
                  {day.punches.map((p, i) => (
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
                          {p.source}
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

            {day.holidayConflict && (
              <HolidayConflictSection
                conflict={day.holidayConflict}
                attendanceId={day.attendanceRecordId}
                onExplain={onExplainHolidayCheckIn}
              />
            )}

            {/* A missed check-in has no row yet. Submit a date-based correction; the API creates
                an absent placeholder and only changes attendance after an approver accepts. */}
            {day.dayStatus === 'ABSENT' && onSubmitMissingDay && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground mb-1.5">
                  Request attendance regularization
                </div>
                {submitted ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                    Sent for approval. Attendance will be updated after your admin accepts the
                    request.
                  </div>
                ) : activeForm !== 'regularization' ? (
                  <Button
                    type="button"
                    onClick={() => setActiveForm('regularization')}
                    className="w-full"
                  >
                    Request regularization
                  </Button>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      Enter the actual times you worked. Your admin must approve this request before
                      the attendance record changes.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="regularization-check-in" className="mb-1 block text-[11px]">
                          Actual check-in *
                        </label>
                        <TimePicker
                          id="regularization-check-in"
                          value={missingCheckIn}
                          onChange={setMissingCheckIn}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="regularization-check-out"
                          className="mb-1 block text-[11px]"
                        >
                          Actual check-out
                        </label>
                        <TimePicker
                          id="regularization-check-out"
                          value={missingCheckOut}
                          onChange={setMissingCheckOut}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <Textarea
                      maxLength={LIMITS.reason}
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={`Reason (at least ${ATTENDANCE_CORRECTION_REASON_MIN_LENGTH} characters)`}
                      disabled={saving}
                    />
                    {error && (
                      <p role="alert" className="text-[11px] font-medium text-destructive">
                        {error}
                      </p>
                    )}
                    <Button
                      type="button"
                      disabled={
                        saving ||
                        !missingCheckIn ||
                        reason.trim().length < ATTENDANCE_CORRECTION_REASON_MIN_LENGTH
                      }
                      onClick={() => void handleMissingDay()}
                      className="w-full"
                    >
                      {saving ? 'Submitting…' : 'Submit regularization request'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* A day that ended on a check-in gets its check-out added instead. */}
            {day.openCheckInAt && day.attendanceRecordId && onSubmitMissingCheckOut && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground mb-1.5">
                  Add missing check-out
                </div>
                {activeForm !== 'missing-checkout' ? (
                  <Button
                    type="button"
                    onClick={() => setActiveForm('missing-checkout')}
                    className="w-full"
                  >
                    Request correction
                  </Button>
                ) : (
                  <MissingCheckOutForm
                    key={day.attendanceRecordId}
                    checkInAt={day.openCheckInAt}
                    onSubmit={(checkOutAt, missingReason) =>
                      onSubmitMissingCheckOut(day.attendanceRecordId!, checkOutAt, missingReason)
                    }
                  />
                )}
              </div>
            )}

            {/* Correct an existing punch */}
            {day.dayStatus === 'PRESENT' && !(day.openCheckInAt && onSubmitMissingCheckOut) && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground mb-1.5">
                  Regularize attendance
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5">
                  Ask for this day to be regularized. Your approver reviews the request.
                </p>
                {submitted ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-medium">
                    ✓ Regularization request submitted successfully.
                  </div>
                ) : activeForm !== 'regularization' ? (
                  <Button
                    type="button"
                    onClick={() => setActiveForm('regularization')}
                    className="w-full"
                  >
                    Request correction
                  </Button>
                ) : (
                  <div className="space-y-2.5">
                    <Textarea
                      maxLength={LIMITS.reason}
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for regularization (min 10 characters)..."
                      className="bg-muted/40 focus:bg-card"
                    />
                    {error && (
                      <p role="alert" className="text-[11px] font-medium text-destructive">
                        {error}
                      </p>
                    )}
                    {!recordId && (
                      <p className="text-[11px] text-muted-foreground">
                        There is no attendance record for this day to correct.
                      </p>
                    )}
                    <Button
                      type="button"
                      disabled={
                        saving ||
                        !recordId ||
                        reason.trim().length < ATTENDANCE_CORRECTION_REASON_MIN_LENGTH
                      }
                      onClick={() => void handleSubmit()}
                      className="w-full"
                    >
                      {saving ? 'Submitting…' : 'Submit regularization request'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-muted/40 flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
