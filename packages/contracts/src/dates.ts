/**
 * Dates as people read them: "20 Sep 2026", never "2026-09-20".
 *
 * Calendar dates arrive as `YYYY-MM-DD` or midnight-UTC timestamps and are read in UTC, so a
 * viewer west of Greenwich does not see the day before. A real moment is shown in the viewer's
 * zone. Month names are spelled out here rather than taken from the runtime's locale data, which
 * differs between browsers ("Sep" in one, "Sept" in another).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type Day = { year: number; month: number; day: number };

function calendarDay(value: string | Date): Day | null {
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const isMidnightUtc =
    typeof value === 'string' &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) || /T00:00:00(\.0+)?Z$/.test(value));
  return isMidnightUtc
    ? { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
    : { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/** "20 Sep 2026". Empty for a missing or unreadable value. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = value ? calendarDay(value) : null;
  return d ? `${d.day} ${MONTHS[d.month]} ${d.year}` : '';
}

/** "20 Sep, 3:45 pm" — for a moment rather than a day. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const time = `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}, ${time}`;
}

/**
 * A span of days, as short as it can be said: "20 – 21 Sep 2026", "28 Sep – 3 Oct 2026",
 * "September 2026" for a whole calendar month, or one date when it starts and ends the same day.
 */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  const a = start ? calendarDay(start) : null;
  const b = end ? calendarDay(end) : null;
  if (!a || !b) return formatDate(start ?? end);
  const sameYear = a.year === b.year;
  const sameMonth = sameYear && a.month === b.month;
  const lastOfMonth = new Date(Date.UTC(b.year, b.month + 1, 0)).getUTCDate();
  if (sameMonth && a.day === 1 && b.day === lastOfMonth) return `${LONG_MONTHS[a.month]} ${a.year}`;
  if (sameMonth && a.day === b.day) return formatDate(start);
  const from = sameMonth
    ? `${a.day}`
    : sameYear
      ? `${a.day} ${MONTHS[a.month]}`
      : `${a.day} ${MONTHS[a.month]} ${a.year}`;
  return `${from} – ${b.day} ${MONTHS[b.month]} ${b.year}`;
}
