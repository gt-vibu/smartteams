'use client';

import { Badge, Checkbox, Label } from '@smarteam/ui';
import type { ProjectMembership, TeamMembership } from '../../services/membership-state';
import {
  DEFAULT_ALLOCATION,
  type ProjectDraftMap,
  type TeamDraft,
} from '../../services/assignment-changes';

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
}: {
  memberships: TeamMembership[];
  draft: TeamDraft;
  onToggle: (teamId: string, checked: boolean) => void;
  canWrite: boolean;
  disabled: boolean;
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
            <label
              className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
              key={membership.team.id}
            >
              <Checkbox
                checked={draft[membership.team.id] ?? false}
                disabled={!canWrite || disabled}
                onCheckedChange={(checked) => onToggle(membership.team.id, checked === true)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {membership.team.name}
                </span>
                {membership.state === 'ENDED' && (
                  <span className="text-[10px] text-muted-foreground">
                    Previously a member until {membership.endedOn?.slice(0, 10)}
                  </span>
                )}
              </span>
            </label>
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
  onAllocate,
  canWrite,
  disabled,
  totalAllocation,
}: {
  memberships: ProjectMembership[];
  draft: ProjectDraftMap;
  onToggle: (projectId: string, checked: boolean) => void;
  onAllocate: (projectId: string, allocation: number) => void;
  canWrite: boolean;
  disabled: boolean;
  totalAllocation: number;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Projects</h3>
        <Badge variant={totalAllocation > 100 ? 'destructive' : 'outline'}>
          {totalAllocation}% allocated
        </Badge>
      </div>
      {!canWrite && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Read-only &mdash; you cannot change project allocation.
        </p>
      )}
      {memberships.length === 0 ? (
        <p className="text-xs text-muted-foreground">No projects match this search.</p>
      ) : (
        <div className="space-y-2">
          {memberships.map((membership) => {
            const entry = draft[membership.project.id];
            const selected = entry?.selected ?? false;
            const isActive = membership.state === 'ACTIVE';
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
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {membership.project.name}
                  </span>
                  {isActive && (
                    <span className="font-mono text-xs font-bold text-primary">
                      {membership.allocationPercentage === null
                        ? '--'
                        : `${membership.allocationPercentage}%`}
                    </span>
                  )}
                </label>

                {membership.state === 'ENDED' && (
                  <p className="mt-1 pl-8 text-[10px] text-muted-foreground">
                    Previously allocated until {membership.endedOn?.slice(0, 10)}
                  </p>
                )}

                {selected && !isActive && (
                  <div className="mt-3 border-t border-border pt-3">
                    <Label
                      className="mb-1 block uppercase tracking-wider"
                      htmlFor={`allocation-${membership.project.id}`}
                    >
                      Allocation ({entry?.allocation ?? DEFAULT_ALLOCATION}%)
                    </Label>
                    <input
                      className="w-full cursor-pointer accent-primary"
                      disabled={disabled}
                      id={`allocation-${membership.project.id}`}
                      max="100"
                      min="10"
                      onChange={(event) =>
                        onAllocate(membership.project.id, Number.parseInt(event.target.value, 10))
                      }
                      step="5"
                      type="range"
                      value={entry?.allocation ?? DEFAULT_ALLOCATION}
                    />
                  </div>
                )}

                {selected && isActive && (
                  <p className="mt-1 pl-8 text-[10px] text-muted-foreground">
                    Allocation cannot be changed after assignment.
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
