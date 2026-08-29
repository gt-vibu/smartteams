'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { authRepository } from '../repositories/auth.repository';
import { Persona, WorkspaceContext, ApprovalDomainType } from '../types/auth.types';
import { getVisibleSpaces } from '../services/navigation.service';

export function useAuth() {
  const [currentPersona, setCurrentPersona] = useState<Persona>(() =>
    authRepository.getCurrentPersona(),
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    authRepository.isAuthenticated(),
  );
  const [workspaceContext, setWorkspaceContextState] = useState<WorkspaceContext>(() =>
    authRepository.getWorkspaceContext(),
  );

  const availablePersonas = useMemo(() => authRepository.getAllPersonas(), []);

  const refresh = useCallback(() => {
    setTimeout(() => {
      setCurrentPersona(authRepository.getCurrentPersona());
      setIsAuthenticated(authRepository.isAuthenticated());
      setWorkspaceContextState(authRepository.getWorkspaceContext());
    }, 0);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('ems:storage:change', handleStorageChange);
    window.addEventListener('ems:storage:reset', handleStorageChange);
    return () => {
      window.removeEventListener('ems:storage:change', handleStorageChange);
      window.removeEventListener('ems:storage:reset', handleStorageChange);
    };
  }, [refresh]);

  const switchPersona = useCallback((personaId: string) => {
    const updated = authRepository.switchPersona(personaId);
    setCurrentPersona(updated);
    setIsAuthenticated(true);
    setWorkspaceContextState(authRepository.getWorkspaceContext());
    return updated;
  }, []);

  const switchWorkspace = useCallback((context: WorkspaceContext) => {
    const updated = authRepository.setWorkspaceContext(context);
    setWorkspaceContextState(updated);
    return updated;
  }, []);

  const loginWithCredentials = useCallback((email: string, password?: string) => {
    const user = authRepository.loginWithCredentials(email, password);
    if (user) {
      setCurrentPersona(user);
      setIsAuthenticated(true);
      setWorkspaceContextState(authRepository.getWorkspaceContext());
    }
    return user;
  }, []);

  const login = useCallback(
    (personaId: string) => {
      return switchPersona(personaId);
    },
    [switchPersona],
  );

  const logout = useCallback(() => {
    authRepository.logout();
    setIsAuthenticated(false);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      return authRepository.hasPermission(permission, currentPersona);
    },
    [currentPersona],
  );

  const hasAnyPermission = useCallback(
    (permissions: string[]) => {
      return authRepository.hasAnyPermission(permissions, currentPersona);
    },
    [currentPersona],
  );

  /** Exact permission check — '*' wildcard is NOT expanded. */
  const hasExplicitPermission = useCallback(
    (permission: string) => {
      return authRepository.hasExplicitPermission(permission, currentPersona);
    },
    [currentPersona],
  );

  const canApprove = useCallback(
    (domain: ApprovalDomainType, resource?: { requesterId?: string; employeeId?: string }) => {
      return authRepository.canApprove(domain, resource);
    },
    [],
  );

  const isAssignedToAnyTeam = useMemo(() => {
    return currentPersona.assignedTeamIds && currentPersona.assignedTeamIds.length > 0;
  }, [currentPersona]);

  const visibleSpaces = useMemo(() => {
    return getVisibleSpaces(currentPersona, workspaceContext, isAssignedToAnyTeam);
  }, [currentPersona, workspaceContext, isAssignedToAnyTeam]);

  const canAccessSpace = useCallback(
    (space: string) => {
      return visibleSpaces.some((s) => s.id === space);
    },
    [visibleSpaces],
  );

  const canAccessModule = useCallback(
    (moduleName: string) => {
      if (workspaceContext === 'ADMIN') {
        if (moduleName === 'payroll') return hasPermission('payroll.read') || hasPermission('*');
        if (moduleName === 'approvals') return true;
        return true;
      }

      // Employee Workspace module permissions:
      switch (moduleName) {
        case 'home':
        case 'time-off':
        case 'timesheet':
        case 'attendance':
        case 'projects':
        case 'files':
          return true;
        case 'payroll':
          return hasPermission('payroll.read') || hasPermission('*');
        case 'approvals':
          // Only managers with EXPLICIT approval permissions see this in Employee Workspace.
          // '*' wildcard and direct-report count alone are NOT sufficient.
          // hasExplicitPermission is used here — it does NOT expand '*'.
          return (
            hasExplicitPermission('leave.approve') ||
            hasExplicitPermission('timesheets.approve') ||
            hasExplicitPermission('attendance.approve')
          );
        case 'teams':
          return isAssignedToAnyTeam;
        case 'onboarding':
          return false; // Onboarding is exclusively in Admin/Organization workspace
        default:
          return false;
      }
    },
    [workspaceContext, currentPersona, hasPermission, hasExplicitPermission, isAssignedToAnyTeam],
  );

  return {
    persona: currentPersona,
    session: authRepository.getAuthSession(),
    availablePersonas,
    isAuthenticated,
    workspaceContext,
    canSwitchWorkspace: Boolean(currentPersona.canSwitchWorkspace),
    visibleSpaces,
    switchPersona,
    switchWorkspace,
    loginWithCredentials,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasExplicitPermission,
    canApprove,
    isAssignedToAnyTeam,
    canAccessSpace,
    canAccessModule,
  };
}
