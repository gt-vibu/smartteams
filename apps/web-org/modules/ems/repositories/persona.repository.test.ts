import { describe, expect, it } from 'vitest';
import type { AuthenticatedSession } from '@smarteam/contracts';
import { PersonaRepository } from './persona.repository';

/**
 * Workspace switching, per the actual server state it must key off.
 *
 * `canSwitchWorkspace` used to be `hasPermission(session.permissions, 'organizations.read')`
 * alone — nothing about whether the user has an employee identity at all. That let an
 * administrator with no employee record toggle into the Employee Workspace, which then had no
 * employee to resolve: `session.employee` stayed null and every screen reading it rendered a
 * broken or empty experience instead of the option being absent. These pin the fix: switching
 * requires both administrative authority and an employee identity to switch *to*.
 */
function session(overrides: Partial<AuthenticatedSession>): AuthenticatedSession {
  return {
    user: {
      id: 'user-1',
      email: 'a@example.test',
      displayName: 'Test User',
      identityType: 'NATIVE',
      isActive: true,
      lastLoginAt: null,
    },
    session: { id: 's1', organizationId: 'org-1', expiresAt: new Date().toISOString() },
    organization: null,
    memberships: [],
    roles: [],
    permissions: [],
    platform: { isPlatformOperator: false, permissions: [] },
    employee: null,
    ...overrides,
  };
}

const repo = new PersonaRepository();

describe('PersonaRepository workspace capability', () => {
  it('an admin with no employee identity cannot switch, and defaults to Admin', () => {
    const persona = repo.forSession(
      session({ permissions: ['organizations.read', '*'], employee: null }),
    );
    expect(persona.canSwitchWorkspace).toBe(false);
    expect(persona.defaultWorkspace).toBe('ADMIN');
  });

  it('an admin who also has an employee identity can switch both ways', () => {
    const persona = repo.forSession(
      session({
        permissions: ['organizations.read', '*'],
        employee: { id: 'emp-1', employeeNumber: 'EMP-001', branchId: null },
      }),
    );
    expect(persona.canSwitchWorkspace).toBe(true);
    expect(persona.defaultWorkspace).toBe('ADMIN');
  });

  it('an employee with no administrative permission cannot switch, and defaults to Employee', () => {
    const persona = repo.forSession(
      session({
        permissions: ['attendance.read'],
        employee: { id: 'emp-2', employeeNumber: 'EMP-002', branchId: null },
      }),
    );
    expect(persona.canSwitchWorkspace).toBe(false);
    expect(persona.defaultWorkspace).toBe('EMPLOYEE');
  });

  it('a locked-out admin (no employee, no switch) always resolves to the Admin default', () => {
    // An administrative permission, not `organizations.read` — the seeded EMPLOYEE role holds
    // that one, so it identifies an ordinary employee rather than an administrator.
    const persona = repo.forSession(session({ permissions: ['members.read'] }));
    // Even if a stale localStorage value from an earlier session says 'EMPLOYEE', the absence of
    // switch capability means the stored preference is never read.
    expect(repo.getWorkspaceContext(persona)).toBe('ADMIN');
    expect(repo.setWorkspaceContext(persona, 'EMPLOYEE')).toBe('ADMIN');
  });
});

describe('PersonaRepository default workspace for a self-service employee', () => {
  /**
   * The seeded EMPLOYEE role, verbatim in the part that matters: it holds `organizations.read`,
   * which an employee needs to see the organization's name and holidays.
   *
   * `canAdminister` used to be exactly that permission, so an employee activating their own
   * account landed in the Organization workspace with an admin switcher on the top bar. Every
   * screen there was refused by the API, which is the "navigate, then discover a 403" experience
   * the whole permission-aware navigation exists to prevent.
   */
  const seededEmployeePermissions = [
    'organizations.read',
    'employees.read',
    'attendance.read',
    'attendance.write',
    'leave.requests.read',
    'timesheets.read',
  ];

  it('defaults a newly activated employee to the Employee workspace', () => {
    const persona = repo.forSession(
      session({
        permissions: seededEmployeePermissions,
        employee: { id: 'emp-3', employeeNumber: 'EMP-201', branchId: null },
      }),
    );
    expect(persona.defaultWorkspace).toBe('EMPLOYEE');
    expect(persona.canSwitchWorkspace).toBe(false);
  });

  it('does not offer them the Organization workspace even with a stored preference', () => {
    const persona = repo.forSession(
      session({
        permissions: seededEmployeePermissions,
        employee: { id: 'emp-3', employeeNumber: 'EMP-201', branchId: null },
      }),
    );
    expect(repo.setWorkspaceContext(persona, 'ADMIN')).toBe('EMPLOYEE');
    expect(repo.getWorkspaceContext(persona)).toBe('EMPLOYEE');
  });
});
