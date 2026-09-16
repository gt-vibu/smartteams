import type { AssignmentChange } from '../hooks/use-assignments';
import type { ProjectMembership, TeamMembership } from './membership-state';

/** Allocation used for a newly added project until the user moves the slider. */
export const DEFAULT_ALLOCATION = 50;

export type ProjectDraft = { selected: boolean; allocation: number };

export type TeamDraft = Record<string, boolean>;
export type ProjectDraftMap = Record<string, ProjectDraft>;

/**
 * Turns the drafted selection into the API calls that realise it.
 *
 * Unchecking is an end-date, never a delete: the backend soft-closes membership so history
 * survives. Allocation on an already-active project is not diffed because the API has no route
 * to change it — the field is read-only in that case rather than silently discarded.
 */
export function buildChanges(
  teams: readonly TeamMembership[],
  projects: readonly ProjectMembership[],
  teamDraft: TeamDraft,
  projectDraft: ProjectDraftMap,
): AssignmentChange[] {
  const changes: AssignmentChange[] = [];

  for (const membership of teams) {
    const wanted = teamDraft[membership.team.id] ?? membership.state === 'ACTIVE';
    if (wanted && membership.state !== 'ACTIVE') {
      changes.push({ kind: 'ADD_TEAM', teamId: membership.team.id });
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
        allocationPercentage: draft?.allocation ?? DEFAULT_ALLOCATION,
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

/**
 * Capacity the employee would be committed to once the draft is saved.
 *
 * An already-active allocation counts at its stored value, because the draft cannot change it.
 */
export function draftedAllocation(
  projects: readonly ProjectMembership[],
  projectDraft: ProjectDraftMap,
): number {
  return projects.reduce((sum, membership) => {
    const draft = projectDraft[membership.project.id];
    if (!(draft?.selected ?? membership.state === 'ACTIVE')) return sum;
    return sum + (membership.allocationPercentage ?? draft?.allocation ?? 0);
  }, 0);
}
