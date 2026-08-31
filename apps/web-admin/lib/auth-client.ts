import {
  authenticatedSessionSchema,
  type AuthenticatedSession,
  type PlatformAuthority,
} from '@smarteam/contracts';
import { ApiClientError, request } from './http-client';

/**
 * The admin console's session is whatever `GET /v1/auth/me` reports, and nothing else.
 *
 * There is no client-side session store: the browser holds only HttpOnly cookies it cannot
 * read, so the authenticated identity, the platform authority and the permissions all come
 * from the server on every load. Nothing here can be edited from devtools to gain access.
 */
export type AdminSession = AuthenticatedSession;

/**
 * Signs in a platform operator. On success the API sets the session cookies; this returns the
 * server's view of the resulting session.
 *
 * A failure throws. It never falls back to a locally minted session — doing so would let
 * anyone who can make the API error reach the console as an administrator.
 */
export async function platformLogin(email: string, password: string): Promise<AdminSession> {
  await request('/v1/auth/platform-login', { method: 'POST', body: { email, password } });
  return fetchSession();
}

export async function logout(): Promise<void> {
  try {
    await request('/v1/auth/logout', { method: 'POST' });
  } catch {
    // The cookies are cleared by the API; a network failure here must not block the operator
    // from leaving the console.
  }
}

/** Reads the current session, or null when no valid session cookie is present. */
export async function readSession(): Promise<AdminSession | null> {
  try {
    return await fetchSession();
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

async function fetchSession(): Promise<AdminSession> {
  const payload = await request('/v1/auth/me', { method: 'GET' });
  const parsed = authenticatedSessionSchema.safeParse(payload);
  if (!parsed.success) throw new ApiClientError('The session response was not valid.', 502);
  return parsed.data;
}

/**
 * The console is a platform-operator tool: the API enforces this on every endpoint via
 * `PlatformAuthGuard`, and this check only decides what to render.
 */
export function isPlatformOperator(platform: PlatformAuthority): boolean {
  return platform.isPlatformOperator;
}
