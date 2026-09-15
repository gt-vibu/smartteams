import type { AuthenticatedSession, OrganizationMembership } from '@smarteam/contracts';
import type {
  ApprovalDomainType,
  AuthSession,
  Persona,
  WorkspaceContext,
} from '../types/auth.types';
import {
  canApprove as evaluateApproval,
  can,
  canAny,
  canExplicitly,
} from '../services/authorization.policy';
import { personaRepository } from './persona.repository';
import { sessionRepository, type LoginOutcome } from './session.repository';

/**
 * Facade over the authenticated session and the persona that renders it.
 *
 * What changed, and why it matters:
 *
 *  - Authentication happens only on the server. The previous implementation signed a user in
 *    locally when the API was unreachable *or returned 401*, minting a persona with
 *    `ORG_ADMIN` and `permissions: ['*']` for any address with a six-character password. That
 *    path is gone; a failed sign-in leaves the user signed out.
 *  - Permissions always come from `GET /v1/auth/me`. They are never defaulted to `['*']` when
 *    the server reports an empty set, which previously escalated an unprivileged user into a
 *    tenant administrator.
 *  - No token is stored. Access and refresh tokens live in HttpOnly cookies the browser cannot
 *    read, so nothing here writes credentials to local storage.
 *  - The committed fixture passwords are never consulted.
 *
 * Everything this class exposes is presentation state. The API independently authorizes every
 * request, so nothing here is a security boundary.
 */
export class AuthRepository {
  private session: AuthenticatedSession | null = null;
  private persona: Persona | null = null;

  /** Restores the session from the server. Returns null when not signed in. */
  async restore(): Promise<Persona | null> {
    return this.adopt(await sessionRepository.restore());
  }

  /**
   * Signs in. When the account belongs to several organizations the caller receives
   * `SELECT_ORGANIZATION` and must retry with an explicit choice — the server will not pick a
   * tenant on the user's behalf.
   */
  async login(email: string, password: string, organizationId?: string): Promise<LoginOutcome> {
    const outcome = await sessionRepository.login(email, password, organizationId);
    if (outcome.status === 'AUTHENTICATED' && !this.adopt(outcome.session)) {
      // Credentials were valid but the session is not tenant-scoped. Revoke it rather than
      // leaving a usable session cookie behind for an app that will never accept it.
      await sessionRepository.logout();
      throw new Error('This account does not have an organization workspace.');
    }
    return outcome;
  }

  async logout(): Promise<void> {
    await sessionRepository.logout();
    this.session = null;
    this.persona = null;
    personaRepository.clear();
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  getCurrentPersona(): Persona | null {
    return this.persona;
  }

  /**
   * The signed-in persona, for code that only runs inside the authenticated workspace.
   * Throws rather than returning a blank identity that could be mistaken for a real user.
   */
  requireCurrentPersona(): Persona {
    if (!this.persona) throw new Error('No authenticated session');
    return this.persona;
  }

  getMemberships(): OrganizationMembership[] {
    return this.session?.memberships ?? [];
  }

  getWorkspaceContext(): WorkspaceContext {
    return this.persona ? personaRepository.getWorkspaceContext(this.persona) : 'EMPLOYEE';
  }

  setWorkspaceContext(context: WorkspaceContext): WorkspaceContext {
    if (!this.persona) return 'EMPLOYEE';
    return personaRepository.setWorkspaceContext(this.persona, context);
  }

  /** Legacy shape consumed by the workspace screens. */
  getAuthSession(): AuthSession | null {
    if (!this.session || !this.persona) return null;
    return {
      user: this.persona.user,
      personaId: this.persona.id,
      // Falling back to the persona id here made every screen request an employee that does
      // not exist, which the API answered with 404. No employee record means null.
      employeeId: this.session.employee?.id ?? null,
      organizationId: this.session.organization?.id ?? '',
      branchId: this.session.employee?.branchId ?? null,
      roles: this.persona.roles,
      permissions: new Set(this.session.permissions),
      workspaceContext: this.getWorkspaceContext(),
    };
  }

  private permissions(): readonly string[] {
    return this.session?.permissions ?? [];
  }

  hasPermission(permission: string): boolean {
    return can(this.permissions(), permission);
  }

  hasAnyPermission(permissions: string[]): boolean {
    return canAny(this.permissions(), permissions);
  }

  /** Exact check; the tenant wildcard is NOT expanded. */
  hasExplicitPermission(permission: string): boolean {
    return canExplicitly(this.permissions(), permission);
  }

  canApprove(
    domain: ApprovalDomainType,
    resource?: { requesterId?: string; employeeId?: string },
  ): boolean {
    if (!this.persona) return false;
    return evaluateApproval(
      {
        currentUserId: this.persona.id,
        directReportEmployeeIds: this.persona.directReportEmployeeIds,
        workspaceContext: this.getWorkspaceContext(),
        permissions: this.permissions(),
      },
      domain,
      resource,
    );
  }

  /**
   * Accepts a session only if it is scoped to a tenant.
   *
   * Being authenticated is not sufficient to enter this workspace. A platform-operator session
   * authenticates against `/me` perfectly well but carries `organization: null` and an empty
   * tenant permission set, so admitting it would render an organization workspace for an
   * account that belongs to no organization. In local development both apps are served from
   * `localhost` and therefore share one cookie jar, which is exactly how such a session
   * reaches this app.
   */
  private adopt(session: AuthenticatedSession | null): Persona | null {
    if (!session?.organization) {
      this.session = null;
      this.persona = null;
      personaRepository.clear();
      return null;
    }
    this.session = session;
    this.persona = personaRepository.forSession(session);
    return this.persona;
  }
}

export const authRepository = new AuthRepository();
