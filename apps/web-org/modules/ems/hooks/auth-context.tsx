'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OrganizationMembership } from '@smarteam/contracts';
import { authRepository } from '../repositories/auth.repository';
import { canAccessModule as evaluateModuleAccess } from '../services/authorization.policy';
import type {
  ApprovalDomainType,
  AuthSession,
  Persona,
  WorkspaceContext,
} from '../types/auth.types';
import { getVisibleSpaces } from '../services/navigation.service';

export type LoginResult =
  | { status: 'AUTHENTICATED' }
  | { status: 'SELECT_ORGANIZATION'; organizations: OrganizationMembership[] }
  | { status: 'FAILED'; message: string };

export type SessionState = {
  persona: Persona | null;
  session: AuthSession | null;
  memberships: OrganizationMembership[];
  isAuthenticated: boolean;
  /** True until the initial `GET /v1/auth/me` settles, so the shell can avoid flashing login. */
  isRestoring: boolean;
  workspaceContext: WorkspaceContext;
  canSwitchWorkspace: boolean;
  visibleSpaces: ReturnType<typeof getVisibleSpaces>;
  login: (email: string, password: string, organizationId?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  switchWorkspace: (context: WorkspaceContext) => WorkspaceContext;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasExplicitPermission: (permission: string) => boolean;
  canApprove: (
    domain: ApprovalDomainType,
    resource?: { requesterId?: string; employeeId?: string },
  ) => boolean;
  isAssignedToAnyTeam: boolean;
  canAccessSpace: (space: string) => boolean;
  canAccessModule: (moduleName: string) => boolean;
};

const AuthContext = createContext<SessionState | null>(null);

/**
 * Owns the authenticated session for the workspace.
 *
 * The session is restored by asking the API (`GET /v1/auth/me`), never by reading local
 * storage, and every permission exposed below is the server's answer. This state decides what
 * is rendered; the API independently authorizes every request it receives, so editing this
 * state in devtools grants nothing.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [workspaceContext, setWorkspaceContextState] = useState<WorkspaceContext>('EMPLOYEE');

  const sync = useCallback((next: Persona | null) => {
    setPersona(next);
    setWorkspaceContextState(authRepository.getWorkspaceContext());
  }, []);

  useEffect(() => {
    let active = true;
    authRepository
      .restore()
      .then((restored) => {
        if (active) sync(restored);
      })
      .catch(() => {
        if (active) sync(null);
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [sync]);

  const login = useCallback(
    async (email: string, password: string, organizationId?: string): Promise<LoginResult> => {
      try {
        const outcome = await authRepository.login(email, password, organizationId);
        if (outcome.status === 'SELECT_ORGANIZATION') {
          return { status: 'SELECT_ORGANIZATION', organizations: outcome.organizations };
        }
        sync(authRepository.getCurrentPersona());
        return { status: 'AUTHENTICATED' };
      } catch (error) {
        // A failed sign-in stays failed. There is no local fallback identity.
        sync(null);
        return {
          status: 'FAILED',
          message: error instanceof Error ? error.message : 'Unable to sign in.',
        };
      }
    },
    [sync],
  );

  const logout = useCallback(async () => {
    await authRepository.logout();
    sync(null);
  }, [sync]);

  const switchWorkspace = useCallback((context: WorkspaceContext) => {
    const updated = authRepository.setWorkspaceContext(context);
    setWorkspaceContextState(updated);
    return updated;
  }, []);

  const permissions = persona?.permissions ?? [];
  const isAssignedToAnyTeam = (persona?.assignedTeamIds.length ?? 0) > 0;

  const value = useMemo<SessionState>(() => {
    const visibleSpaces = persona
      ? getVisibleSpaces(persona, workspaceContext, isAssignedToAnyTeam)
      : [];
    return {
      persona,
      session: authRepository.getAuthSession(),
      memberships: authRepository.getMemberships(),
      isAuthenticated: persona !== null,
      isRestoring,
      workspaceContext,
      canSwitchWorkspace: Boolean(persona?.canSwitchWorkspace),
      visibleSpaces,
      login,
      logout,
      switchWorkspace,
      hasPermission: (permission) => authRepository.hasPermission(permission),
      hasAnyPermission: (candidates) => authRepository.hasAnyPermission(candidates),
      hasExplicitPermission: (permission) => authRepository.hasExplicitPermission(permission),
      canApprove: (domain, resource) => authRepository.canApprove(domain, resource),
      isAssignedToAnyTeam,
      canAccessSpace: (space) => visibleSpaces.some((entry) => entry.id === space),
      canAccessModule: (moduleName) =>
        evaluateModuleAccess(moduleName, workspaceContext, permissions, isAssignedToAnyTeam),
    };
    // `persona` carries the server's permission set, so it is the only input the permission
    // helpers below depend on.
  }, [
    persona,
    permissions,
    isRestoring,
    workspaceContext,
    isAssignedToAnyTeam,
    login,
    logout,
    switchWorkspace,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Session state including the unauthenticated case. Used by the workspace shell. */
export function useSession(): SessionState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useSession must be used within an AuthProvider');
  return value;
}
