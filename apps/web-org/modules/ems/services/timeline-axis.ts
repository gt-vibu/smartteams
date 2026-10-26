/**
 * The hours the attendance timeline spans.
 *
 * A 24-hour ruler left a nine-to-six day as a thin sliver in the middle of the row. The ruler now
 * runs from two hours before the shift starts to two hours after it ends, widened to take in any
 * punch that week falling outside that. Without a shift it spans 6 AM to 10 PM on the same rule.
 * A shift that crosses midnight keeps the whole day.
 */

export type TimelineAxis = { startHour: number; endHour: number };

const hourOf = (clock: string) => Number.parseInt(clock.slice(0, 2), 10);

export function timelineAxis(
  shift: { startsAt: string; endsAt: string } | null | undefined,
  /** Punch positions this week, as percentages of a 24-hour day. */
  punchPercents: readonly number[],
): TimelineAxis {
  let startHour = 6;
  let endHour = 22;
  if (shift) {
    const from = hourOf(shift.startsAt);
    const to = hourOf(shift.endsAt) + (shift.endsAt.slice(3, 5) === '00' ? 0 : 1);
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return { startHour: 0, endHour: 24 };
    startHour = from - 2;
    endHour = to + 2;
  }
  for (const percent of punchPercents) {
    const hour = (percent / 100) * 24;
    startHour = Math.min(startHour, Math.floor(hour));
    endHour = Math.max(endHour, Math.ceil(hour));
  }
  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 4)),
  };
}

/** Where a point on the 24-hour track sits on the axis, 0–100. */
export function onAxis(percentOfDay: number, axis: TimelineAxis): number {
  const hour = (percentOfDay / 100) * 24;
  const position = ((hour - axis.startHour) / (axis.endHour - axis.startHour)) * 100;
  return Math.min(100, Math.max(0, position));
}

/** Labels for the ruler: every hour on a short axis, every two or three on a longer one. */
export function axisTicks(axis: TimelineAxis): Array<{ label: string; percent: number }> {
  const span = axis.endHour - axis.startHour;
  const step = span <= 10 ? 1 : span <= 16 ? 2 : 3;
  const ticks: Array<{ label: string; percent: number }> = [];
  for (let hour = axis.startHour; hour <= axis.endHour; hour += step) {
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    ticks.push({
      label: `${twelve} ${hour % 24 < 12 ? 'AM' : 'PM'}`,
      percent: ((hour - axis.startHour) / span) * 100,
    });
  }
  return ticks;
}
