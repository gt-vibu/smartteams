'use client';

import React, { useState } from 'react';
import { Button, Label, Textarea } from '@smarteam/ui';
import {
  ATTENDANCE_CORRECTION_REASON_MAX_LENGTH,
  ATTENDANCE_CORRECTION_REASON_MIN_LENGTH,
} from '@smarteam/contracts';
import { HOLIDAY_CHECK_IN_REASON_SUGGESTIONS } from '../../services/holiday-conflict-view';

interface HolidayCheckInFormProps {
  holidayName: string;
  /** Resolves when the server recorded the explanation; rejects with the reason to show. */
  onSubmit: (reason: string, comment: string) => Promise<unknown>;
  /** Called after an accepted explanation, so the caller can close. */
  onSubmitted?: () => void;
}

/**
 * The employee's explanation of a check-in on their approved optional holiday.
 *
 * The suggestions only fill the reason box; the employee can edit them or write their own. The
 * explanation changes nothing by itself — a manager decides whether the day stays a holiday.
 */
export function HolidayCheckInForm({
  holidayName,
  onSubmit,
  onSubmitted,
}: HolidayCheckInFormProps) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ready = reason.trim().length >= ATTENDANCE_CORRECTION_REASON_MIN_LENGTH;

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(reason.trim(), comment.trim());
      setSent(true);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The explanation could not be sent.');
    } finally {
      setSaving(false);
    }
  };

  if (sent)
    return (
      <p className="rounded border border-border bg-muted/40 p-3 text-xs font-medium text-foreground">
        Sent to your manager. Until they decide, {holidayName} stays an approved holiday.
      </p>
    );

  return (
    <div className="space-y-2.5">
      <div>
        <Label htmlFor="holiday-check-in-reason" className="mb-1 block text-[11px]">
          Why did you work today? <span className="text-destructive">*</span>
        </Label>
        <div className="mb-1.5 flex flex-wrap gap-1.5" aria-label="Suggested reasons">
          {HOLIDAY_CHECK_IN_REASON_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={saving}
              onClick={() => setReason(suggestion)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <Textarea
          id="holiday-check-in-reason"
          rows={2}
          value={reason}
          maxLength={ATTENDANCE_CORRECTION_REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
          placeholder={`Reason (at least ${ATTENDANCE_CORRECTION_REASON_MIN_LENGTH} characters)`}
          disabled={saving}
        />
      </div>
      <div>
        <Label htmlFor="holiday-check-in-comment" className="mb-1 block text-[11px]">
          Comment (optional)
        </Label>
        <Textarea
          id="holiday-check-in-comment"
          rows={2}
          value={comment}
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Anything your manager should know"
          disabled={saving}
        />
      </div>
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
        {saving ? 'Sending…' : 'Send for manager review'}
      </Button>
    </div>
  );
}
