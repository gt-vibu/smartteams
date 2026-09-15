'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import type { AssignmentsState } from '../../hooks/use-assignments';
import {
  DEFAULT_ALLOCATION,
  buildChanges,
  draftedAllocation,
  type ProjectDraftMap,
  type TeamDraft,
} from '../../services/assignment-changes';
import { ProjectPicker, TeamPicker } from './assignment-pickers';

interface AssignEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  /** Owned by the drawer so both surfaces read and refresh the same membership state. */
  assignments: AssignmentsState;
}

function matches(name: string, query: string) {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Team and project assignment for one employee.
 *
 * The dialog holds only a draft of what the user has ticked. Saving diffs that draft against
 * server state and issues the corresponding API calls; nothing is written locally, and the
 * lists reload from the server afterwards.
 */
export function AssignEmployeeModal({
  isOpen,
  onClose,
  employeeName,
  assignments,
}: AssignEmployeeModalProps) {
  const { teamMemberships, projectMemberships } = assignments;

  const [teamDraft, setTeamDraft] = useState<TeamDraft>({});
  const [projectDraft, setProjectDraft] = useState<ProjectDraftMap>({});
  const [query, setQuery] = useState('');

  // Re-seed the draft from server state each time the dialog opens or the data reloads, so a
  // cancelled edit never lingers and a refetch after saving is reflected immediately.
  useEffect(() => {
    if (!isOpen) return;
    setTeamDraft(Object.fromEntries(teamMemberships.map((m) => [m.team.id, m.state === 'ACTIVE'])));
    setProjectDraft(
      Object.fromEntries(
        projectMemberships.map((m) => [
          m.project.id,
          {
            selected: m.state === 'ACTIVE',
            allocation: m.allocationPercentage ?? DEFAULT_ALLOCATION,
          },
        ]),
      ),
    );
  }, [isOpen, teamMemberships, projectMemberships]);

  const changes = useMemo(
    () => buildChanges(teamMemberships, projectMemberships, teamDraft, projectDraft),
    [teamMemberships, projectMemberships, teamDraft, projectDraft],
  );

  const totalAllocation = draftedAllocation(projectMemberships, projectDraft);
  const visibleTeams = teamMemberships.filter((m) => matches(m.team.name, query));
  const visibleProjects = projectMemberships.filter((m) => matches(m.project.name, query));

  const handleSave = async () => {
    if (changes.length === 0) return;
    const saved = await assignments.applyChanges(changes);
    if (saved) onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-bold">
          Manage assignments &mdash; {employeeName}
        </DialogTitle>

        <div className="border-b border-border px-5 py-3">
          <Label className="sr-only" htmlFor="assignment-search">
            Search teams and projects
          </Label>
          <Input
            id="assignment-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search teams and projects"
            value={query}
          />
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5">
          {assignments.loading && (
            <p className="text-xs text-muted-foreground" role="status">
              Loading teams and projects...
            </p>
          )}

          {!assignments.loading && assignments.forbidden && (
            <p className="text-xs text-muted-foreground" role="status">
              You do not have permission to view teams and projects.
            </p>
          )}

          {!assignments.loading && assignments.error && !assignments.forbidden && (
            <p className="text-xs text-destructive" role="alert">
              {assignments.error}
            </p>
          )}

          {!assignments.loading && !assignments.error && (
            <>
              <TeamPicker
                canWrite={assignments.canWriteTeams}
                disabled={assignments.saving}
                draft={teamDraft}
                memberships={visibleTeams}
                onToggle={(teamId, checked) =>
                  setTeamDraft((prev) => ({ ...prev, [teamId]: checked }))
                }
              />
              <ProjectPicker
                canWrite={assignments.canWriteProjects}
                disabled={assignments.saving}
                draft={projectDraft}
                memberships={visibleProjects}
                onAllocate={(projectId, allocation) =>
                  setProjectDraft((prev) => ({
                    ...prev,
                    [projectId]: { selected: true, allocation },
                  }))
                }
                onToggle={(projectId, checked) =>
                  setProjectDraft((prev) => ({
                    ...prev,
                    [projectId]: {
                      allocation: prev[projectId]?.allocation ?? DEFAULT_ALLOCATION,
                      selected: checked,
                    },
                  }))
                }
                totalAllocation={totalAllocation}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] text-muted-foreground" role="status">
            {assignments.saveError ? (
              <span className="font-semibold text-destructive">{assignments.saveError}</span>
            ) : changes.length === 0 ? (
              'No changes to save.'
            ) : (
              `${changes.length} change${changes.length === 1 ? '' : 's'} pending.`
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={assignments.saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={assignments.saving || changes.length === 0}
              onClick={() => void handleSave()}
              type="button"
            >
              {assignments.saving ? 'Saving...' : 'Save assignments'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
