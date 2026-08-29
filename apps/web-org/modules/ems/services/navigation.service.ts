import { Persona, WorkspaceContext } from '../types/auth.types';

export interface NavigationSpaceItem {
  id: 'My Space' | 'Team' | 'Organization';
  label: string;
  scope: 'ORGANIZATION' | 'SELF' | 'TEAM';
  contexts: WorkspaceContext[];
  requiredPermissions?: string[];
  requiresTeamMembership?: boolean;
}

export const ALL_NAVIGATION_SPACES: NavigationSpaceItem[] = [
  // 1. My Space — Personal / Self-service Space (Employee Context)
  {
    id: 'My Space',
    label: 'My Space',
    scope: 'SELF',
    contexts: ['EMPLOYEE'],
  },
  // 2. Team — Assigned Squad Space
  {
    id: 'Team',
    label: 'Team',
    scope: 'TEAM',
    contexts: ['EMPLOYEE'],
    requiresTeamMembership: true,
  },
  // 3. Organization — Enterprise & Admin Governance Space
  {
    id: 'Organization',
    label: 'Organization',
    scope: 'ORGANIZATION',
    contexts: ['ADMIN'],
    requiredPermissions: ['organizations.read', '*'],
  },
];

export function getVisibleSpaces(
  persona: Persona,
  workspace: WorkspaceContext,
  hasAssignedTeams: boolean,
): NavigationSpaceItem[] {
  const permSet = new Set(persona.permissions || []);
  const isWildcard = permSet.has('*');

  return ALL_NAVIGATION_SPACES.filter((space) => {
    // 1. Filter by current operating workspace context
    if (!space.contexts.includes(workspace)) {
      return false;
    }

    // 2. Team membership constraint (Team space is visible if employee belongs to team or is Admin)
    if (space.requiresTeamMembership && !hasAssignedTeams && !isWildcard) {
      return false;
    }

    // 3. Permission checks
    if (space.requiredPermissions && space.requiredPermissions.length > 0) {
      if (isWildcard) return true;
      const hasReq = space.requiredPermissions.some((p) => permSet.has(p));
      if (!hasReq) return false;
    }

    return true;
  });
}
