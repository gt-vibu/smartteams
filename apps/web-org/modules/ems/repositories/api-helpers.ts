import { ApiError } from '../lib/api-client';

/**
 * Shared repository plumbing.
 *
 * These three helpers were copied into every repository as it was reconciled. Extracted before
 * the remaining modules are wired so the rules they encode — tenant-scoped paths, validated
 * responses, encoded query strings — are stated once rather than re-derived nine more times.
 */

/** Tenant-scoped base path. The organization id comes from the session, never from user input. */
export function orgPath(organizationId: string, suffix = ''): string {
  return `/v1/organizations/${encodeURIComponent(organizationId)}${suffix}`;
}

/**
 * Unwraps a parsed response.
 *
 * A shape mismatch raises rather than returning null, so a screen never renders `undefined` in
 * place of a value the server did send differently.
 */
export function expectShape<T>(value: T | null, label: string): T {
  if (value === null) throw new ApiError(`The ${label} response was not valid.`, 502);
  return value;
}

/** Builds a query string, dropping absent values so an empty filter is not sent as `?x=`. */
export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
