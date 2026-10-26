import type { HolidayConflict, HolidayConflictState } from '@smarteam/contracts';

/**
 * How a check-in on a granted optional holiday reads on screen.
 *
 * Such a day is never shown as a plain "Present": until a manager decides, it is both a holiday
 * and a worked day, and afterwards it is one or the other. The state comes from the API.
 */

export type HolidayConflictTone = 'attention' | 'holiday' | 'working';

export type HolidayConflictView = {
  state: HolidayConflictState;
  holidayName: string;
  label: string;
  detail: string;
  tone: HolidayConflictTone;
  /** Unresolved: the employee or a manager still has something to do. */
  unresolved: boolean;
  /** The employee has not yet explained the check-in. */
  needsReason: boolean;
  reason: string | null;
  decisionComment: string | null;
};

/** What the employee is told straight after checking in on the holiday. */
export const HOLIDAY_CHECK_IN_MESSAGE =
  'You have an approved optional holiday for today. You checked in on this holiday. This requires manager review.';

/** Starting points for the reason; the employee edits or replaces them, and none is required. */
export const HOLIDAY_CHECK_IN_REASON_SUGGESTIONS = [
  'My manager asked me to work today',
  'Urgent work that could not wait',
  'I checked in by mistake',
] as const;

const COPY: Record<
  HolidayConflictState,
  { label: string; detail: string; tone: HolidayConflictTone }
> = {
  AWAITING_REASON: {
    label: 'Worked on holiday · reason needed',
    detail: 'Checked in on an approved optional holiday. Explain why so a manager can review it.',
    tone: 'attention',
  },
  AWAITING_DECISION: {
    label: 'Worked on holiday · awaiting manager',
    detail: 'Checked in on an approved optional holiday. A manager is reviewing it.',
    tone: 'attention',
  },
  HOLIDAY_KEPT: {
    label: 'Holiday kept · check-in not counted',
    detail: 'A manager kept the holiday. The check-in stays on record but counts no worked time.',
    tone: 'holiday',
  },
  CONVERTED_TO_WORKING_DAY: {
    label: 'Holiday cancelled · working day',
    detail: 'A manager cancelled the holiday. The day counts as an ordinary working day.',
    tone: 'working',
  },
};

export function toHolidayConflictView(conflict: HolidayConflict): HolidayConflictView {
  const copy = COPY[conflict.state];
  return {
    state: conflict.state,
    holidayName: conflict.holiday.name,
    label: copy.label,
    detail: copy.detail,
    tone: copy.tone,
    unresolved: conflict.state === 'AWAITING_REASON' || conflict.state === 'AWAITING_DECISION',
    needsReason: conflict.state === 'AWAITING_REASON',
    reason: conflict.review?.reason ?? null,
    decisionComment: conflict.review?.decisionComment ?? null,
  };
}

/** One view per attendance record id. */
export function holidayConflictsByRecord(
  conflicts: readonly HolidayConflict[],
): Map<string, HolidayConflictView> {
  return new Map(
    conflicts.map((conflict) => [conflict.attendanceId, toHolidayConflictView(conflict)]),
  );
}

/** Tailwind classes for the pill that carries the label, by tone. */
export const HOLIDAY_CONFLICT_PILL: Record<HolidayConflictTone, string> = {
  attention: 'border-amber-300 bg-amber-50 text-amber-900',
  holiday: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  working: 'border-border bg-muted text-foreground',
};
