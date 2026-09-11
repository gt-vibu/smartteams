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

  /** Current session, or null when there is no valid session cookie. */
  async restore(): Promise<AuthenticatedSession | null> {
    try {
      return await this.fetch();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return null;
      }
      throw error;
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
