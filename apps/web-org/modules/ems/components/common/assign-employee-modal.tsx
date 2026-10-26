'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LoadingIndicator, Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import type { AssignmentsState } from '../../hooks/use-assignments';
import {
  buildChanges,
  type ProjectDraftMap,
  type RoleDraft,
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

/**
 * What the employee is on right now, before any of the lists below.
 *
 * The dialog is a tick-list of every team and project in the company, so the ones they already
 * belong to were only findable by scrolling for a ticked box. This states them plainly; the
 * lists below are for joining and leaving.
 */
function CurrentAssignments({ teams, projects }: { teams: string[]; projects: string[] }) {
  const groups: Array<[string, string[], string]> = [
    ['Teams', teams, 'Not on any team yet.'],
    ['Projects', projects, 'Not on any project yet.'],
  ];

  return (
    <div className="grid grid-cols-1 gap-4 border-b border-border bg-muted/30 px-5 py-3 sm:grid-cols-2">
      {groups.map(([label, names, empty]) => (
        <div key={label}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Current {label.toLowerCase()}
            {names.length > 0 && ` · ${names.length}`}
          </p>
          {names.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{empty}</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {names.map((name) => (
                <span
                  className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  key={name}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
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
  const [roles, setRoles] = useState<RoleDraft>({});
  const setRole = (key: string, role: string) => setRoles((prev) => ({ ...prev, [key]: role }));
  const [query, setQuery] = useState('');

  // Re-seed the draft from server state each time the dialog opens or the data reloads, so a
  // cancelled edit never lingers and a refetch after saving is reflected immediately.
  useEffect(() => {
    if (!isOpen) return;
    setTeamDraft(Object.fromEntries(teamMemberships.map((m) => [m.team.id, m.state === 'ACTIVE'])));
    setProjectDraft(
      Object.fromEntries(
        projectMemberships.map((m) => [m.project.id, { selected: m.state === 'ACTIVE' }]),
      ),
    );
  }, [isOpen, teamMemberships, projectMemberships]);

  const changes = useMemo(
    () => buildChanges(teamMemberships, projectMemberships, teamDraft, projectDraft, roles),
    [teamMemberships, projectMemberships, teamDraft, projectDraft, roles],
  );

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

        <CurrentAssignments
          projects={projectMemberships
            .filter((m) => m.state === 'ACTIVE')
            .map((m) => m.project.name)}
          teams={teamMemberships.filter((m) => m.state === 'ACTIVE').map((m) => m.team.name)}
        />

        <div className="border-b border-border px-5 py-3">
          <Label className="sr-only" htmlFor="assignment-search">
            Search teams and projects
          </Label>
          <Input
            id="assignment-search"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search teams and projects"
            placeholder="Search teams and projects"
            value={query}
          />
        </div>

        <div className="sm:max-h-[70vh] space-y-6 overflow-y-auto p-5">
          {assignments.loading && (
            <LoadingIndicator variant="inline" label="Loading teams and projects" className="text-xs text-muted-foreground" />
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
                onRole={setRole}
                roles={roles}
                onToggle={(teamId, checked) =>
                  setTeamDraft((prev) => ({ ...prev, [teamId]: checked }))
                }
              />
              <ProjectPicker
                canWrite={assignments.canWriteProjects}
                disabled={assignments.saving}
                draft={projectDraft}
                memberships={visibleProjects}
                onToggle={(projectId, checked) =>
                  setProjectDraft((prev) => ({
                    ...prev,
                    [projectId]: { selected: checked },
                  }))
                }
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
