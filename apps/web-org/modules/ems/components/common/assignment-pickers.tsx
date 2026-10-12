'use client';

import { formatDate } from '@smarteam/contracts';
import { Badge, Checkbox } from '@smarteam/ui';
import type { ProjectDraftMap, RoleDraft, TeamDraft } from '../../services/assignment-changes';
import type { ProjectMembership, TeamMembership } from '../../services/membership-state';
import { PicklistSelect } from './picklist-select';

/**
 * The two selection lists inside the assignment dialog.
 *
 * They render membership state as the backend reports it: an ended membership is unticked but
 * labelled with the date it closed, so it never reads as though the person was never there.
 */

export function TeamPicker({
  memberships,
  draft,
  onToggle,
  canWrite,
  disabled,
  roles,
  onRole,
}: {
  memberships: TeamMembership[];
  draft: TeamDraft;
  onToggle: (teamId: string, checked: boolean) => void;
  canWrite: boolean;
  disabled: boolean;
  roles: RoleDraft;
  onRole: (key: string, role: string) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Teams</h3>
      {!canWrite && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Read-only &mdash; you cannot change team membership.
        </p>
      )}
      {memberships.length === 0 ? (
        <p className="text-xs text-muted-foreground">No teams match this search.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {memberships.map((membership) => (
            <div className="rounded-md border border-border bg-card p-3" key={membership.team.id}>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={draft[membership.team.id] ?? false}
                  disabled={!canWrite || disabled}
                  onCheckedChange={(checked) => onToggle(membership.team.id, checked === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {membership.team.name}
                    </span>
                    {membership.isLead && (
                      <Badge
                        className="border-amber-500/20 bg-amber-500/10 text-[9px] text-amber-600 dark:text-amber-400"
                        variant="outline"
                      >
                        Lead
                      </Badge>
                    )}
                  </span>
                  {membership.state === 'ENDED' && (
                    <span className="text-[10px] text-muted-foreground">
                      Previously a member until {formatDate(membership.endedOn)}
                    </span>
                  )}
                </span>
              </label>
              {draft[membership.team.id] && membership.state !== 'ACTIVE' && (
                <div className="mt-2 pl-8">
                  <PicklistSelect
                    addLabel="+ Add a role"
                    disabled={disabled}
                    kind="team-roles"
                    noneLabel="Team role (optional)"
                    onChange={(role) => onRole(`team:${membership.team.id}`, role)}
                    value={roles[`team:${membership.team.id}`] ?? ''}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectPicker({
  memberships,
  draft,
  onToggle,
  canWrite,
  disabled,
}: {
  memberships: ProjectMembership[];
  draft: ProjectDraftMap;
  onToggle: (projectId: string, checked: boolean) => void;
  canWrite: boolean;
  disabled: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Projects</h3>
      </div>
      {!canWrite && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Read-only &mdash; you cannot change project membership.
        </p>
      )}
      {memberships.length === 0 ? (
        <p className="text-xs text-muted-foreground">No projects match this search.</p>
      ) : (
        <div className="space-y-2">
          {memberships.map((membership) => {
            const entry = draft[membership.project.id];
            const selected = entry?.selected ?? false;
            return (
              <div
                className="rounded-md border border-border bg-card p-3"
                key={membership.project.id}
              >
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={selected}
                    disabled={!canWrite || disabled}
                    onCheckedChange={(checked) => onToggle(membership.project.id, checked === true)}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {membership.project.name}
                    </span>
                    {membership.isLead && (
                      <Badge
                        className="border-amber-500/20 bg-amber-500/10 text-[9px] text-amber-600 dark:text-amber-400"
                        variant="outline"
                      >
                        Lead
                      </Badge>
                    )}
                  </span>
                </label>

                {membership.state === 'ENDED' && (
                  <p className="mt-1 pl-8 text-[10px] text-muted-foreground">
                    Was on this project until {formatDate(membership.endedOn)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
