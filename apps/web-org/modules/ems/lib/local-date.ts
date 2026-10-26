/**
 * Calendar days as the person using the app sees them.
 *
 * `toISOString()` answers in UTC, so from midnight until 05:30 in India it names yesterday, and a
 * date built at local midnight (`new Date(2026, 9, 1)`) comes out as the day before. Everything
 * that means "today", or keys a day someone picked on a calendar, goes through here instead.
 */

/** `YYYY-MM-DD` for the local calendar day `date` falls on. */
export function localDateKey(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** The local calendar day `days` from today; negative for the past. */
export function localDateKeyIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}
