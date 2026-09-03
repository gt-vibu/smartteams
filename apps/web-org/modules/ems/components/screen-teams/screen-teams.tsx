'use client';

import React, { useState } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button, Input } from '@smarteam/ui';
import { useTeamDirectory } from '../../hooks/use-team-directory';
import type { TeamView } from '../../services/team-directory';
import { CreateTeamModal } from './create-team-modal';
import { TeamCard, TeamTable } from './team-views';
import { TeamDetailDrawer } from './team-detail-drawer';

/**
 * Teams and squads, read from and written to the API.
 *
 * There is no Archived tab: `GET /teams` returns active teams only, so an archived list would
 * always be empty and would read as "there are none" rather than "this view cannot show them".
 */
export function ScreenTeams() {
  const directory = useTeamDirectory();
  // Scope is a view, not a filter: Back should step between "all" and "mine" the way it
  // steps between tabs. The search box and the grid/table toggle stay local — walking Back
  // through keystrokes or a display preference would read as a broken button.
  const [scope, setScope] = useScreenTab<'all' | 'mine'>('teamScope', ['all', 'mine'], 'all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const source = scope === 'mine' ? directory.myTeams : directory.teams;
  const query = search.trim().toLowerCase();
  const filtered = source.filter((view) => {
    if (!query) return true;
    return (
      view.team.name.toLowerCase().includes(query) ||
      (view.branchName ?? '').toLowerCase().includes(query) ||
      (view.team.description ?? '').toLowerCase().includes(query) ||
      (view.lead?.displayName ?? '').toLowerCase().includes(query)
    );
  });

  // Read from the live list so the drawer follows a refetch instead of holding a stale copy.
  const selectedTeam: TeamView | null =
    directory.teams.find((view) => view.team.id === selectedTeamId) ?? null;

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
                {value === 'all' ? 'All teams' : 'My teams'}
              </Button>
            ))}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <Input
              className="w-40 sm:w-52"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teams"
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
                New team
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-4 pb-6 pt-3.5 sm:px-6">
        {directory.loading && (
          <p className="py-10 text-center text-xs text-muted-foreground" role="status">
            Loading teams...
          </p>
        )}

        {!directory.loading && directory.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
            <p className="text-sm font-bold text-foreground">Not available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You do not have permission to view teams.
            </p>
          </div>
        )}

        {!directory.loading && directory.error && !directory.forbidden && (
          <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
            <p className="text-sm font-bold text-foreground">Could not load teams</p>
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
              {scope === 'mine' ? 'You are not on any team' : 'No teams yet'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {search
                ? 'No team matches this search.'
                : scope === 'mine'
                  ? 'You have not been added to a team.'
                  : 'No teams have been created for this organization.'}
            </p>
          </div>
        )}

        {!directory.loading &&
          !directory.error &&
          filtered.length > 0 &&
          (viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((view) => (
                <TeamCard
                  key={view.team.id}
                  onClick={() => setSelectedTeamId(view.team.id)}
                  team={view}
                />
              ))}
            </div>
          ) : (
            <TeamTable onSelect={(view) => setSelectedTeamId(view.team.id)} teams={filtered} />
          ))}
      </div>

      {selectedTeam && (
        <TeamDetailDrawer
          directory={directory}
          onClose={() => setSelectedTeamId(null)}
          team={selectedTeam}
        />
      )}

      <CreateTeamModal
        branches={directory.branches}
        employees={directory.employees}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={directory.createTeam}
        saveError={directory.saveError}
        saving={directory.saving}
      />
    </div>
  );
}
