import { hasPermission, type AuthenticatedSession } from '@smarteam/contracts';
import { emsStorageAdapter } from '../storage/storage.adapter';
import type { Persona, WorkspaceContext } from '../types/auth.types';

const STORAGE_KEY_WORKSPACE = 'ems_workspace_context';

/**
 * The display shell for a signed-in user.
 *
 * This used to match the authenticated email against `mock-users.json` and, on a hit, take the
 * job title, department, branch, manager name, team ids, project ids and direct reports from the
 * fixture. Permissions were already server-derived, so it granted no authority — but it rendered
 * invented business facts as though they were real, and a tenant whose user happened to share an
 * address with a fixture inherited a stranger's reporting line.
 *
 * Everything here now comes from `GET /v1/auth/me`. Fields the session does not carry are absent
 * rather than borrowed: the reporting line, job title and department are read from
 * `GET /employees/:id/detail` by the components that show them.
 */
export class PersonaRepository {
  /**
   * Builds the display persona for an authenticated session.
   *
   * Identity, roles and permissions are the session's. Nothing else is asserted.
   */
  forSession(session: AuthenticatedSession): Persona {
    const roles: Persona['roles'] = session.roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      scope: role.scope === 'BRANCH' ? 'BRANCH' : 'ORGANIZATION',
      branchId: role.branchId,
      // The effective set is `session.permissions` — the union the API resolved — so per-role
      // keys are not repeated here.
      permissionKeys: [],
    }));

    // Workspace capability follows the server's permission set. A tenant administrator onboarded
    // through the platform console would otherwise be stranded in the employee workspace.
    const canAdminister = hasPermission(session.permissions, 'organizations.read');

    return {
      id: session.user.id,
      name: session.user.displayName,
      badge: session.roles[0]?.name ?? 'Member',
      email: session.user.email,
      jobTitle: null,
      department: null,
      branchId: session.employee?.branchId ?? null,
      branchName: null,
      employeeNumber: session.employee?.employeeNumber ?? null,
      avatarInitials: initialsOf(session.user.displayName),
      avatarUrl: null,
      roles,
      permissions: session.permissions,
      assignedTeamIds: [],
      assignedProjectIds: [],
      directReportEmployeeIds: [],
      managerEmployeeId: null,
      managerName: null,
      canSwitchWorkspace: canAdminister,
      defaultWorkspace: canAdminister ? 'ADMIN' : 'EMPLOYEE',
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        avatarUrl: null,
        avatarInitials: initialsOf(session.user.displayName),
        identityType: session.user.identityType,
        isActive: session.user.isActive,
      },
    };
  }

  /** Which workspace the person last chose. A UI preference, not business state. */
  getWorkspaceContext(persona: Persona): WorkspaceContext {
    if (!persona.canSwitchWorkspace) return persona.defaultWorkspace ?? 'EMPLOYEE';
    return emsStorageAdapter.getItem<WorkspaceContext>(
      STORAGE_KEY_WORKSPACE,
      persona.defaultWorkspace ?? 'EMPLOYEE',
    );
  }

  setWorkspaceContext(persona: Persona, context: WorkspaceContext): WorkspaceContext {
    if (!persona.canSwitchWorkspace) return persona.defaultWorkspace ?? 'EMPLOYEE';
    emsStorageAdapter.setItem(STORAGE_KEY_WORKSPACE, context);
    return context;
  }

  clear(): void {
    emsStorageAdapter.removeItem(STORAGE_KEY_WORKSPACE);
  }
}

function initialsOf(displayName: string): string {
  return (
    displayName
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export const personaRepository = new PersonaRepository();
