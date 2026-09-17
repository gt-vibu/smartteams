/** Presentation helpers shared across the admin console. */

/** Renders an ISO timestamp in the viewer's locale and timezone. */
export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/**
 * Turns a thrown value into operator-facing text.
 *
 * `ApiClientError` already carries a safe, server-derived message; anything else is unexpected
 * and is replaced with a generic line so internal details never surface in the UI.
 */
export function readableError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
