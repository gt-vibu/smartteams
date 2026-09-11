import type { Request } from 'express';

/**
 * Reads a single cookie by exact name from the raw `Cookie` header.
 *
 * Deliberately not `cookie-parser`: that would be an extra dependency and a global request
 * mutation solely to populate `req.cookies`, when only three names are ever read.
 *
 * Lives in `common/security` rather than in the auth module because the CSRF middleware needs
 * it too, and `common` must not depend on a feature module.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    // Exact match only, so `not_smarteam_session` cannot be mistaken for `smarteam_session`.
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? decodeURIComponent(value) : undefined;
  }
  return undefined;
}
