/**
 * Dates for the end-to-end suites that do not depend on which day they run.
 *
 * Three suites booked leave on `daysAgo(2)`. Leave that covers only a weekend has no working
 * days and is refused as a conflict, so they passed on a Wednesday and failed on a Monday — the
 * date was a Saturday — and the leave-decision checks after it then ran against an id of
 * `undefined`. The rule was right; the suites were picking their dates by the calendar.
 */
const iso = (date) => date.toISOString().slice(0, 10);

/** The most recent Monday–Friday at least `n` days back, as `YYYY-MM-DD`. */
export function weekdaysAgo(n) {
  const day = new Date(Date.now() - n * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() - 1);
  return iso(day);
}
