/**
 * Format total minutes to standard enterprise duration string (e.g. 528 -> "08h 48m")
 */
export function formatMinutesToDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
}

/**
 * Format total seconds to tabular time components
 */
export function formatSecondsToTime(seconds: number): {
  hrs: string;
  mins: string;
  secs: string;
} {
  const safeSeconds = Math.max(0, seconds);
  const hrs = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = (safeSeconds % 60).toString().padStart(2, '0');
  return { hrs, mins, secs };
}
