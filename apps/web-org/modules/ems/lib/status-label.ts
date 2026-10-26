/**
 * A stored status as people read it: `APPROVED` → "Approved", `HALF_DAY` → "Half day".
 *
 * Statuses arrive as the codes the server stores. Shown as-is they read like system output, so
 * every status on screen goes through here. The few whose plain reading differs from the code are
 * named; everything else is sentence-cased from the code.
 */
const NAMED: Record<string, string> = {
  REQUESTED: 'Requested',
  PARTIALLY_RECOVERED: 'Repaying',
  RECOVERED: 'Repaid',
  REJECTED: 'Rejected',
  DEACTIVATED: 'Inactive',
  INACTIVE: 'Inactive',
  TERMINATED: 'Exited',
  ON_LEAVE: 'On leave',
  LEAVE: 'On leave',
  WEEKLY_OFF: 'Weekend',
  WEEKEND: 'Weekend',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const known = NAMED[status];
  if (known) return known;
  // Anything that is not a stored code (already words) is left as written.
  if (!/^[A-Z][A-Z0-9_]*$/.test(status)) return status;
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
