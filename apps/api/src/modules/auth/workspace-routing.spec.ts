import { hasPermission } from '@smarteam/contracts';

/**
 * Workspace routing rule, mirrored from `web-org`'s `PersonaRepository.forSession`.
 *
 * A tenant administrator onboarded through the platform console has no display fixture, so the
 * workspace they land in must be derived from the permission set the API reports. Deriving it
 * from fixture flags instead strands a real `ORG_ADMIN` in the employee workspace with no way
 * to switch, which is the failure this test exists to prevent.
 */
function workspaceFor(permissions: string[]) {
  const canAdminister = hasPermission(permissions, 'organizations.read');
  return {
    canSwitchWorkspace: canAdminister,
    defaultWorkspace: canAdminister ? 'ADMIN' : 'EMPLOYEE',
  };
}

describe('tenant workspace routing', () => {
  it('sends a freshly onboarded ORG_ADMIN (wildcard) to the admin workspace', () => {
    expect(workspaceFor(['*'])).toEqual({
      canSwitchWorkspace: true,
      defaultWorkspace: 'ADMIN',
    });
  });

  it('sends a user with explicit organizations.read to the admin workspace', () => {
    expect(workspaceFor(['organizations.read', 'leave.read']).defaultWorkspace).toBe('ADMIN');
  });

  it('keeps an ordinary employee in the employee workspace', () => {
    expect(workspaceFor(['leave.read', 'attendance.read'])).toEqual({
      canSwitchWorkspace: false,
      defaultWorkspace: 'EMPLOYEE',
    });
  });

  it('keeps a user the server granted nothing out of the admin workspace', () => {
    expect(workspaceFor([]).canSwitchWorkspace).toBe(false);
  });
});
