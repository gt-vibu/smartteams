'use client';

import React, { useState } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button, Input } from '@smarteam/ui';
import { useProjectDirectory } from '../../hooks/use-project-directory';
import type { ProjectView } from '../../services/team-directory';
import { CreateProjectModal } from './create-project-modal';
import { ProjectCard, ProjectTable } from './project-views';
import { ProjectDetailDrawer } from './project-detail-drawer';

/**
 * Projects and allocations, read from and written to the API.
 *
 * `GET /projects` returns every project including archived ones, so the status filter here is
 * driven by the status the API reports rather than by a client-side guess.
 */
export function ScreenProjects() {
  const directory = useProjectDirectory();
  // Scope is a view, not a filter: Back should step between "all" and "mine" the way it
  // steps between tabs. The search box and the grid/table toggle stay local — walking Back
  // through keystrokes or a display preference would read as a broken button.
  const [scope, setScope] = useScreenTab<'all' | 'mine'>('projectScope', ['all', 'mine'], 'all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const source = scope === 'mine' ? directory.myProjects : directory.projects;
  const query = search.trim().toLowerCase();
  const filtered = source.filter((view) => {
    if (!query) return true;
    return (
      view.project.name.toLowerCase().includes(query) ||
      (view.project.code ?? '').toLowerCase().includes(query) ||
      (view.branchName ?? '').toLowerCase().includes(query) ||
      (view.project.description ?? '').toLowerCase().includes(query)
    );
  });

  // Read from the live list so the drawer follows a refetch rather than holding a stale copy.
  const selected: ProjectView | null =
    directory.projects.find((view) => view.project.id === selectedProjectId) ?? null;

  return (
    <div className="relative flex w-full flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-4">
            {(['all', 'mine'] as const).map((value) => (
              <Button
                className={`rounded-none pb-1 text-xs font-semibold ${
                  scope === value
                    ? 'border-b-2 border-foreground font-bold text-foreground'
                    : 'text-muted-foreground'
                }`}
                key={value}
                onClick={() => setScope(value)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {value === 'all' ? 'All projects' : 'My projects'}
              </Button>
            ))}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <Input
              className="w-40 sm:w-52"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              type="text"
              value={search}
            />
            <div className="flex items-center overflow-hidden rounded border border-border">
              <Button
                className="h-8 rounded-none px-2.5 text-[11px]"
                onClick={() => setViewMode('grid')}
                size="sm"
                type="button"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              >
                Grid
              </Button>
              <Button
                className="h-8 rounded-none border-l border-border px-2.5 text-[11px]"
                onClick={() => setViewMode('table')}
                size="sm"
                type="button"
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              >
                Table
              </Button>
            </div>
            {directory.canWrite && (
              <Button onClick={() => setIsCreateOpen(true)} size="sm" type="button">
                New project
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-4 pb-6 pt-3.5 sm:px-6">
        {directory.loading && (
          <p className="py-10 text-center text-xs text-muted-foreground" role="status">
            Loading projects...
          </p>
        )}

        {!directory.loading && directory.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
            <p className="text-sm font-bold text-foreground">Not available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You do not have permission to view projects.
            </p>
          </div>
        )}

        {!directory.loading && directory.error && !directory.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
            <p className="text-sm font-bold text-foreground">Could not load projects</p>
            <p className="mt-1 text-xs text-muted-foreground">{directory.error}</p>
            <Button
              className="mt-3"
              onClick={() => void directory.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        )}

        {!directory.loading && !directory.error && filtered.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <p className="text-sm font-bold text-foreground">
              {scope === 'mine' ? 'You have no allocations' : 'No projects yet'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {search
                ? 'No project matches this search.'
                : scope === 'mine'
                  ? 'You are not allocated to any project.'
                  : 'No projects have been created for this organization.'}
            </p>
          </div>
        )}

        {!directory.loading &&
          !directory.error &&
          filtered.length > 0 &&
          (viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((view) => (
                <ProjectCard
                  key={view.project.id}
                  onClick={() => setSelectedProjectId(view.project.id)}
                  view={view}
                />
              ))}
            </div>
          ) : (
            <ProjectTable
              onSelect={(view) => setSelectedProjectId(view.project.id)}
              views={filtered}
            />
          ))}
      </div>

      {selected && (
        <ProjectDetailDrawer
          directory={directory}
          onClose={() => setSelectedProjectId(null)}
          view={selected}
        />
      )}

      <CreateProjectModal
        branches={directory.branches}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={(input) => directory.createProject(input, [])}
        saveError={directory.saveError}
        saving={directory.saving}
      />
    </div>
  );
}
