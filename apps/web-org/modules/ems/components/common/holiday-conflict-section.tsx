'use client';

import React from 'react';
import {
  HOLIDAY_CONFLICT_PILL,
  type HolidayConflictView,
} from '../../services/holiday-conflict-view';
import { HolidayCheckInForm } from './holiday-check-in-form';

interface HolidayConflictSectionProps {
  conflict: HolidayConflictView;
  attendanceId?: string | undefined;
  /** Sends the employee's explanation; offered only while the day still needs one. */
  onExplain?:
    ((attendanceId: string, reason: string, comment: string) => Promise<unknown>) | undefined;
}

/**
 * A day drawer's account of a check-in on an approved optional holiday: where the review stands,
 * what the employee said and what the manager decided, and — while no reason has been given — the
 * form to give one.
 */
export function HolidayConflictSection({
  conflict,
  attendanceId,
  onExplain,
}: HolidayConflictSectionProps) {
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="text-xs font-bold text-foreground">
        Optional holiday · {conflict.holidayName}
      </div>
      <span
        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${HOLIDAY_CONFLICT_PILL[conflict.tone]}`}
      >
        {conflict.label}
      </span>
      <p className="text-[11px] text-muted-foreground">{conflict.detail}</p>
      {conflict.reason && (
        <p className="text-[11px] text-foreground">
          <span className="font-semibold">Your reason:</span> {conflict.reason}
        </p>
      )}
      {conflict.decisionComment && (
        <p className="text-[11px] text-foreground">
          <span className="font-semibold">Manager’s decision:</span> {conflict.decisionComment}
        </p>
      )}
      {conflict.needsReason && attendanceId && onExplain && (
        <HolidayCheckInForm
          key={attendanceId}
          holidayName={conflict.holidayName}
          onSubmit={(reason, comment) => onExplain(attendanceId, reason, comment)}
        />
      )}
    </div>
  );
}
