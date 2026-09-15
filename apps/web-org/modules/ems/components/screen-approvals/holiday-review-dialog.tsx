'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import {
  formatMinutes,
  type HolidayReviewDecision,
  type HolidayReviewOutcome,
} from '@smarteam/contracts';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';

const OUTCOMES: Array<{ value: HolidayReviewOutcome; label: string; effect: string }> = [
  {
    value: 'KEEP_HOLIDAY',
    label: 'Keep the holiday',
    effect:
      'The day stays an approved holiday. The check-in is kept on record but counts no worked time, so it adds nothing to the timesheet.',
  },
  {
    value: 'CONVERT_TO_WORKING_DAY',
    label: 'Convert to a working day',
    effect:
      'The optional holiday is cancelled and the day counts as an ordinary working day with the time recorded.',
  },
];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * A manager's review of a check-in on an approved optional holiday.
 *
 * Nothing is shown as decided until the API accepts it; a refusal keeps the dialog open with the
 * server's reason. Neither choice adds holiday-worked pay: none exists, and inventing one is a
 * payroll policy decision, not something this dialog makes.
 */
export function HolidayReviewDialog({
  item,
  inbox,
  onClose,
}: {
  item: ApprovalInboxItem | null;
  inbox: ApprovalInboxState;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<HolidayReviewOutcome | null>(null);
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<HolidayReviewDecision | null>(null);
  const review = item?.holidayReview;

  const close = () => {
    setOutcome(null);
    setComment('');
    setResult(null);
    onClose();
  };

  const confirm = async () => {
    if (!item || !outcome) return;
    const decided = await inbox.decideHolidayReview(item, outcome, comment.trim());
    if (!decided) return;
    // Anything the approver should know stays on screen; otherwise the dialog is done.
    const needsNotice =
      decided.result === 'NO_LONGER_IN_CONFLICT' ||
      (decided.payroll?.finalizedRuns.length ?? 0) > 0;
    if (needsNotice) setResult(decided);
    else close();
  };

  const punches = review?.attendance.punches ?? [];
  const checkIn = punches.find((punch) => punch.type === 'IN');
  const checkOut = [...punches].reverse().find((punch) => punch.type === 'OUT');

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Worked on an approved optional holiday</DialogTitle>
        {review && (
          <div className="mt-2 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3">
              <span className="text-muted-foreground">Employee</span>
              <span className="font-semibold text-foreground">
                {`${review.employee.firstName} ${review.employee.lastName ?? ''}`.trim()}
              </span>
              <span className="text-muted-foreground">Holiday</span>
              <span className="font-semibold text-foreground">
                {review.holiday.name} · {review.workDate}
              </span>
              <span className="text-muted-foreground">Punches</span>
              <span className="font-mono text-foreground">
                {checkIn ? time(checkIn.occurredAt) : '--'} →{' '}
                {checkOut ? time(checkOut.occurredAt) : 'no check-out'}
              </span>
              <span className="text-muted-foreground">Recorded time</span>
              <span className="font-mono text-foreground">
                {formatMinutes(review.attendance.workedMinutes)}
              </span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Employee’s reason</p>
              <p className="mt-0.5 text-foreground">{review.reason}</p>
              {review.comment && <p className="mt-1 text-muted-foreground">{review.comment}</p>}
            </div>

            {result ? (
              <div
                role="status"
                className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
              >
                {result.result === 'NO_LONGER_IN_CONFLICT' ? (
                  <p>
                    The holiday had already been cancelled, so there was nothing left to decide. The
                    review is closed and nothing else changed.
                  </p>
                ) : (
                  <p>
                    Recorded. Payroll for this date is already{' '}
                    {result.payroll?.finalizedRuns
                      .map((run) => run.status.toLowerCase())
                      .join(', ')}{' '}
                    and was not changed; any adjustment has to go through a payroll correction.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={close}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-1 font-semibold text-foreground">Decision</legend>
                  {OUTCOMES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer gap-2 rounded-md border p-2.5 ${
                        outcome === option.value ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="holiday-review-outcome"
                        value={option.value}
                        checked={outcome === option.value}
                        disabled={inbox.saving}
                        onChange={() => setOutcome(option.value)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-semibold text-foreground">{option.label}</span>
                        <span className="block text-muted-foreground">{option.effect}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div>
                  <Label className="mb-1 block" htmlFor="holiday-review-comment">
                    Reason for the decision
                  </Label>
                  <Textarea
                    id="holiday-review-comment"
                    disabled={inbox.saving}
                    maxLength={500}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </div>
                {inbox.saveError && (
                  <p role="alert" className="text-[11px] font-medium text-destructive">
                    {inbox.saveError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={inbox.saving} onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={inbox.saving || !outcome || comment.trim().length < 2}
                    onClick={() => void confirm()}
                  >
                    {inbox.saving ? 'Recording...' : 'Record decision'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
