'use client';

import React, { useState } from 'react';
import { Button, Input, Label, Textarea } from '@smarteam/ui';
import { ATTENDANCE_CORRECTION_REASON_MIN_LENGTH } from '@smarteam/contracts';

/** `HH:mm` of an instant in the viewer's own time, as a time input holds it. */
const clock = (iso: string | undefined) => {
  if (!iso) return '';
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/** The instant `HH:mm` names on `workDate`, in the viewer's own time. */
const instant = (workDate: string, time: string) =>
  new Date(`${workDate.slice(0, 10)}T${time}:00`).toISOString();

export type CorrectionTimes = { correctedCheckIn?: string; correctedCheckOut?: string };

/**
 * Asks for a day's punches to be corrected: the times as they should have been, and why.
 *
 * Only a time that was changed is sent. Approval moves those punches; the reason alone, which is
 * all this form used to send, left the day exactly as it was once approved.
 */
export function CorrectionForm({
  workDate,
  checkInAt,
  checkOutAt,
  onSubmit,
  onDone,
}: {
  /** Without the day, only the reason can be sent. */
  workDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
  onSubmit: (reason: string, times: CorrectionTimes | undefined) => Promise<unknown>;
  onDone: () => void;
}) {
  const [checkIn, setCheckIn] = useState(clock(checkInAt));
  const [checkOut, setCheckOut] = useState(clock(checkOutAt));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const times: CorrectionTimes = !workDate
    ? {}
    : {
        ...(checkIn && checkIn !== clock(checkInAt)
          ? { correctedCheckIn: instant(workDate, checkIn) }
          : {}),
        ...(checkOut && checkOut !== clock(checkOutAt)
          ? { correctedCheckOut: instant(workDate, checkOut) }
          : {}),
      };
  const outBeforeIn = Boolean(checkIn && checkOut && checkOut <= checkIn);
  const tooShort = reason.trim().length < ATTENDANCE_CORRECTION_REASON_MIN_LENGTH;

  const submit = async () => {
    if (saving || tooShort || outBeforeIn) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(reason, Object.keys(times).length ? times : undefined);
      setSubmitted(true);
      setTimeout(onDone, 1000);
    } catch (caught) {
      // The form stays as it was, so the request can be corrected and sent again.
      setError(caught instanceof Error ? caught.message : 'The correction could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted)
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
        ✓ Sent for approval. The day changes once it is approved.
      </div>
    );

  return (
    <div className="space-y-2.5">
      {workDate && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block text-[11px]" htmlFor="corrected-in">
              Check-in should be
            </Label>
            <Input
              id="corrected-in"
              onChange={(event) => setCheckIn(event.target.value)}
              type="time"
              value={checkIn}
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px]" htmlFor="corrected-out">
              Check-out should be
            </Label>
            <Input
              id="corrected-out"
              onChange={(event) => setCheckOut(event.target.value)}
              type="time"
              value={checkOut}
            />
          </div>
        </div>
      )}
      {outBeforeIn && (
        <p className="text-[11px] text-destructive" role="alert">
          The check-out has to be after the check-in.
        </p>
      )}
      <Textarea
        aria-label="Reason for the correction"
        className="bg-muted/40 focus:bg-card"
        onChange={(event) => setReason(event.target.value)}
        placeholder={`Why it should change (at least ${ATTENDANCE_CORRECTION_REASON_MIN_LENGTH} characters)`}
        rows={3}
        value={reason}
      />
      {error && (
        <p className="text-[11px] font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        className="w-full text-xs font-bold"
        disabled={saving || tooShort || outBeforeIn}
        onClick={() => void submit()}
        type="button"
      >
        {saving ? 'Submitting…' : 'Submit Correction Request'}
      </Button>
    </div>
  );
}
