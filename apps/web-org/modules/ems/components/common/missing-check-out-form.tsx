'use client';

import React, { useState } from 'react';
import { Button, DatePicker, Input, Label, Textarea } from '@smarteam/ui';
import { ATTENDANCE_CORRECTION_REASON_MIN_LENGTH } from '@smarteam/contracts';
import { localDateKey } from '../../hooks/use-attendance';

interface MissingCheckOutFormProps {
  /** The day's open check-in, as an instant. */
  checkInAt: string;
  /** Resolves when the server accepted the request; rejects with the reason to show. */
  onSubmit: (checkOutAt: string, reason: string) => Promise<unknown>;
  /** Called after an accepted request, so the caller can close and refetch. */
  onSubmitted?: () => void;
}

/**
 * Asks for the check-out a day never had.
 *
 * The time is the employee's to state: nothing is prefilled except the check-in's date, because
 * any default — shift end, eight hours, now — would be the system inventing worked time. The
 * request changes nothing until the approver accepts it, and the form says so.
 */
export function MissingCheckOutForm({
  checkInAt,
  onSubmit,
  onSubmitted,
}: MissingCheckOutFormProps) {
  const checkIn = new Date(checkInAt);
  const checkInDate = localDateKey(checkIn);
  const [date, setDate] = useState(checkInDate);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // A late shift can end after midnight, so the next day is selectable; the server refuses
  // anything more than a day after the check-in, or in the future.
  const nextDay = localDateKey(new Date(checkIn.getTime() + 24 * 60 * 60 * 1000));
  const checkOut = time ? new Date(`${date}T${time}:00`) : null;
  const beforeCheckIn = checkOut !== null && checkOut.getTime() <= checkIn.getTime();
  const ready =
    checkOut !== null &&
    !beforeCheckIn &&
    reason.trim().length >= ATTENDANCE_CORRECTION_REASON_MIN_LENGTH;

  const submit = async () => {
    if (!checkOut || !ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(checkOut.toISOString(), reason.trim());
      setSent(true);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  if (sent)
    return (
      <p className="rounded border border-border bg-muted/40 p-3 text-xs font-medium text-foreground">
        Sent for approval. The check-out is added once your approver accepts it.
      </p>
    );

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted-foreground">
        Checked in at{' '}
        <span className="font-mono font-semibold text-foreground">
          {checkIn.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>{' '}
        with no check-out. Enter when you actually left.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="missing-check-out-date" className="mb-1 block text-[11px]">
            Check-out date
          </Label>
          <DatePicker
            id="missing-check-out-date"
            value={date}
            onChange={setDate}
            min={checkInDate}
            max={nextDay}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="missing-check-out-time" className="mb-1 block text-[11px]">
            Actual check-out <span className="text-destructive">*</span>
          </Label>
          <Input
            id="missing-check-out-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            disabled={saving}
            className="h-9 font-mono text-xs"
          />
        </div>
      </div>
      {beforeCheckIn && (
        <p className="text-[11px] font-medium text-destructive">
          The check-out must be after the check-in.
        </p>
      )}
      <Textarea
        rows={3}
        aria-label="Reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
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
        className="w-full text-xs font-bold"
        disabled={!ready || saving}
        onClick={() => void submit()}
      >
        {saving ? 'Submitting…' : 'Request missing check-out'}
      </Button>
    </div>
  );
}
