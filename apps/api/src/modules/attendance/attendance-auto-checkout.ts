import { MISSING_CHECK_OUT_KEY } from './attendance-missing-checkout';

/**
 * Closing a day the employee never checked out of.
 *
 * The close is a proposal, not a fact. It writes no punch and changes no attendance record: it
 * raises the ordinary missing-check-out correction, carrying the organization's cutoff time, which
 * a human then accepts, replaces with the real time, or rejects. Until they do, the day counts no
 * worked time and no overtime — nothing reaches a timesheet or a payslip because a clock struck
 * midnight.
 */

/** Marks a correction as one the system raised, which the reviewer is told and can override. */
export const AUTO_CLOSE_KEY = 'autoClosed';

export const AUTO_CLOSE_REASON =
  'Closed automatically: no check-out was recorded for this day. Confirm the time worked.';

export function autoCloseSnapshot(record: unknown, closeAt: Date) {
  return {
    ...(record as Record<string, unknown>),
    [MISSING_CHECK_OUT_KEY]: { occurredAt: closeAt.toISOString(), [AUTO_CLOSE_KEY]: true },
  };
}

/** Whether this correction was raised by the automatic close rather than by a person. */
export function isAutoClose(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const missing = (snapshot as Record<string, unknown>)[MISSING_CHECK_OUT_KEY];
  return Boolean(
    missing && typeof missing === 'object' && (missing as Record<string, unknown>)[AUTO_CLOSE_KEY],
  );
}

/**
 * The instant at which a wall-clock time falls on a given date in a timezone.
 *
 * "23:59" means 23:59 where the employee works, which is a different instant in every
 * organization and moves twice a year where clocks change. The offset is read at the guessed
 * instant and applied, then read again at the corrected one, which settles the hour either side of
 * a daylight-saving change.
 */
export function instantAtLocalTime(dateKey: string, time: string, timeZone: string): Date {
  const [hour = '0', minute = '0'] = time.split(':');
  const guess = new Date(`${dateKey}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00.000Z`);
  if (Number.isNaN(guess.getTime())) throw new Error(`Invalid close time: ${dateKey} ${time}`);
  const first = new Date(guess.getTime() - offsetMs(guess, timeZone));
  return new Date(guess.getTime() - offsetMs(first, timeZone));
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
    // `hour12: false` reports midnight as 24 in some engines.
    const hour = read('hour') % 24;
    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      hour,
      read('minute'),
      read('second'),
    );
    return asUtc - at.getTime();
  } catch {
    // An unknown timezone falls back to UTC rather than leaving days open forever.
    return 0;
  }
}

/** `23:59` from the time-only column Postgres returns as a 1970 date. */
export function wallClock(time: Date): string {
  return [time.getUTCHours(), time.getUTCMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
