import {
  authenticatedSessionSchema,
  loginResponseSchema,
  type AuthenticatedSession,
  type OrganizationMembership,
} from '@smarteam/contracts';
import { ApiError, apiRequest } from '../lib/api-client';

export type LoginOutcome =
  | { status: 'AUTHENTICATED'; session: AuthenticatedSession }
  | { status: 'SELECT_ORGANIZATION'; organizations: OrganizationMembership[] };

/**
 * The server session, and the only way to become authenticated in this app.
 *
 * Identity, roles and permissions come from `GET /v1/auth/me` on every load. Nothing is
 * derived from the email address, nothing is cached in local storage, and there is no branch
 * that treats an API failure as a successful sign-in.
 */
export class SessionRepository {
  /**
   * Signs in against the API. A user who belongs to several organizations must choose one;
   * the server refuses to pick on their behalf and no session is created until they do.
   */
  async login(email: string, password: string, organizationId?: string): Promise<LoginOutcome> {
    const payload = await apiRequest('/v1/auth/login', {
      method: 'POST',
      body: {
        email: email.trim().toLowerCase(),
        password,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    const parsed = loginResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ApiError('The sign-in response was not valid.', 502);

    if (parsed.data.outcome === 'ORGANIZATION_SELECTION_REQUIRED') {
      return { status: 'SELECT_ORGANIZATION', organizations: parsed.data.organizations };
    }
    return { status: 'AUTHENTICATED', session: await this.fetch() };
  }

  async logout(): Promise<void> {
    try {
      await apiRequest('/v1/auth/logout', { method: 'POST' });
    } catch {
      // The API clears the cookies; a network failure must not trap the user in the workspace.
    }
  }

  /**
   * The current session, or null when there is no valid session cookie.
   *
   * Only 401 and 403 mean "not signed in". A rate limit, a server error or a dropped connection
   * says nothing about the session, and treating them as signed out put people with a valid
   * session back on the sign-in page. Those are retried a few times, then thrown.
   */
  async restore(wait: (ms: number) => Promise<void> = sleep): Promise<AuthenticatedSession | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.fetch();
      } catch (error) {
        // Read by its status rather than its class, so an HTTP error is recognised wherever
        // it was constructed; anything without a status is a network failure.
        const status = (error as { status?: unknown }).status;
        const http = typeof status === 'number' ? status : null;
        if (http === 401 || http === 403) return null;
        const transient = http === null || http === 429 || http >= 500;
        if (!transient || attempt >= RESTORE_RETRY_DELAYS.length) throw error;
        await wait(RESTORE_RETRY_DELAYS[attempt]!);
      }
    }
  }

  private async fetch(): Promise<AuthenticatedSession> {
    const payload = await apiRequest('/v1/auth/me', { method: 'GET' });
    const parsed = authenticatedSessionSchema.safeParse(payload);
    if (!parsed.success) throw new ApiError('The session response was not valid.', 502);
    return parsed.data;
  }
}

export const sessionRepository = new SessionRepository();

/** Waits before each retry of a session check that failed for a reason other than the session. */
const RESTORE_RETRY_DELAYS = [800, 2000, 4000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
