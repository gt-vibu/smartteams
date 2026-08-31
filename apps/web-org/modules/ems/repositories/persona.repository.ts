import { hasPermission, type AuthenticatedSession } from '@smarteam/contracts';
import { emsStorageAdapter } from '../storage/storage.adapter';
import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import mockUsersFixture from '../data/fixtures/mock-users.json';
import type { Persona, WorkspaceContext } from '../types/auth.types';

const STORAGE_KEY_PERSONA = 'ems_active_persona';
const STORAGE_KEY_WORKSPACE = 'ems_workspace_context';

/**
 * Fixture profile data for the workspace screens.
 *
 * These records supply presentation detail the API does not serve yet — job titles, org charts,
 * team assignments. They are display data only.
 *
 * Two properties matter for security:
 *  - the file no longer carries passwords. It previously shipped plaintext credentials that the
 *    sign-in screen rendered as click-to-fill buttons, and no code path authenticates here now;
 *  - `permissions` from a fixture is never used for a signed-in user. The permission set always
 *    comes from `GET /v1/auth/me`, so a fixture cannot grant authority.
 */
interface PersonaFixture extends Omit<Persona, 'name' | 'badge' | 'user'> {
  displayName: string;
  scenarioTitle?: string;
}

const fixtures = mockUsersFixture as unknown as PersonaFixture[];

function toPersona(fixture: PersonaFixture): Persona {
  return {
    ...fixture,
    name: fixture.displayName,
    badge: fixture.scenarioTitle ?? fixture.jobTitle,
    user: {
      id: fixture.id,
      email: fixture.email,
      displayName: fixture.displayName,
      avatarUrl: fixture.avatarUrl,
      avatarInitials: fixture.avatarInitials,
      identityType: 'NATIVE',
      isActive: true,
    },
  };
}

export class PersonaRepository {
  private readonly personas: Persona[] = fixtures.map(toPersona);

  /**
   * Builds the display persona for an authenticated session.
   *
   * The authoritative fields — identity, roles, permissions — are taken from `/me`. A fixture
   * matching the signed-in email contributes only cosmetic detail; when none matches, a
   * minimal persona is derived from the session itself with the server's permission set.
   */
  forSession(session: AuthenticatedSession): Persona {
    const email = session.user.email.toLowerCase();
    const fixture = this.personas.find((persona) => persona.email.toLowerCase() === email);
    // The effective permission set is `session.permissions` (the union the API resolved), so
    // per-role keys are not repeated here.
    const roles: Persona['roles'] = session.roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      scope: role.scope === 'BRANCH' ? 'BRANCH' : 'ORGANIZATION',
      branchId: role.branchId,
      permissionKeys: [],
    }));
    const base = fixture ?? this.placeholderFor(session);

    // Workspace capability follows the server's permission set, not the fixture's flags. A
    // tenant administrator onboarded through the platform console has no fixture, so trusting
    // the placeholder would strand them in the employee workspace with no way to switch.
    const canAdminister = hasPermission(session.permissions, 'organizations.read');

    return {
      ...base,
      id: session.user.id,
      name: session.user.displayName,
      email: session.user.email,
      // Authoritative, server-derived. Never defaulted to a wildcard.
      roles,
      permissions: session.permissions,
      canSwitchWorkspace: canAdminister,
      defaultWorkspace: canAdminister ? 'ADMIN' : 'EMPLOYEE',
      employeeNumber: session.employee?.employeeNumber ?? base.employeeNumber,
      branchId: session.employee?.branchId ?? base.branchId,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        avatarUrl: base.avatarUrl,
        avatarInitials: initialsOf(session.user.displayName),
        identityType: session.user.identityType,
        isActive: session.user.isActive,
      },
    };
  }

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

  /** Mirrors the signed-in persona into the profile key the workspace screens read. */
  publish(persona: Persona): void {
    emsStorageAdapter.setItem(STORAGE_KEY_PERSONA, persona.id);
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.EMPLOYEE, {
      id: persona.id,
      employeeNumber: persona.employeeNumber,
      firstName: persona.name.split(' ')[0] ?? '',
      lastName: persona.name.split(' ').slice(1).join(' '),
      workEmail: persona.email,
      jobTitle: persona.jobTitle,
      department: persona.department,
      location: persona.branchName,
      avatarUrl: persona.avatarUrl,
      manager: persona.managerName
        ? {
            id: persona.managerEmployeeId ?? '',
            employeeNumber: '',
            firstName: persona.managerName.split(' ')[0] ?? '',
            lastName: persona.managerName.split(' ').slice(1).join(' '),
            jobTitle: 'Manager',
            isOnline: false,
          }
        : null,
      departmentMembers: [],
    });
  }

  clear(): void {
    emsStorageAdapter.setItem(STORAGE_KEY_PERSONA, null);
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.EMPLOYEE, null);
  }

  /** Fallback display shell. Carries no permissions of its own. */
  private placeholderFor(session: AuthenticatedSession): Persona {
    return {
      id: session.user.id,
      name: session.user.displayName,
      badge: session.roles[0]?.name ?? 'Member',
      email: session.user.email,
      jobTitle: session.roles[0]?.name ?? 'Member',
      department: session.organization?.name ?? '',
      branchId: session.employee?.branchId ?? '',
      branchName: '',
      employeeNumber: session.employee?.employeeNumber ?? '',
      avatarInitials: initialsOf(session.user.displayName),
      avatarUrl: null,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        avatarUrl: null,
        avatarInitials: initialsOf(session.user.displayName),
        identityType: session.user.identityType,
        isActive: session.user.isActive,
      },
      roles: [],
      permissions: [],
      assignedTeamIds: [],
      assignedProjectIds: [],
      directReportEmployeeIds: [],
      managerEmployeeId: null,
      managerName: null,
      canSwitchWorkspace: false,
      defaultWorkspace: 'EMPLOYEE',
    };
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
