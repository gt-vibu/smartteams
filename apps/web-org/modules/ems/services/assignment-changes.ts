import type { AssignmentChange } from '../hooks/use-assignments';
import type { ProjectMembership, TeamMembership } from './membership-state';

export type ProjectDraft = { selected: boolean };

export type TeamDraft = Record<string, boolean>;
export type ProjectDraftMap = Record<string, ProjectDraft>;
/** Team responsibility chosen for a new team membership. */
export type RoleDraft = Record<string, string>;

/**
 * Turns the drafted selection into the API calls that realise it.
 *
 * Unchecking is an end-date, never a delete: the backend soft-closes membership so history
 * survives.
 */
export function buildChanges(
  teams: readonly TeamMembership[],
  projects: readonly ProjectMembership[],
  teamDraft: TeamDraft,
  projectDraft: ProjectDraftMap,
  roles: RoleDraft = {},
): AssignmentChange[] {
  const changes: AssignmentChange[] = [];

  for (const membership of teams) {
    const wanted = teamDraft[membership.team.id] ?? membership.state === 'ACTIVE';
    if (wanted && membership.state !== 'ACTIVE') {
      const teamRole = roles[`team:${membership.team.id}`];
      changes.push({
        kind: 'ADD_TEAM',
        teamId: membership.team.id,
        ...(teamRole ? { teamRole } : {}),
      });
    } else if (!wanted && membership.state === 'ACTIVE' && membership.memberId) {
      changes.push({
        kind: 'END_TEAM',
        teamId: membership.team.id,
        memberId: membership.memberId,
      });
    }
  }

  for (const membership of projects) {
    const draft = projectDraft[membership.project.id];
    const wanted = draft?.selected ?? membership.state === 'ACTIVE';
    if (wanted && membership.state !== 'ACTIVE') {
      changes.push({
        kind: 'ADD_PROJECT',
        projectId: membership.project.id,
      });
    } else if (!wanted && membership.state === 'ACTIVE' && membership.memberId) {
      changes.push({
        kind: 'END_PROJECT',
        projectId: membership.project.id,
        memberId: membership.memberId,
      });
    }
  }

  return changes;
}
