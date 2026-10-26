'use client';

import React, { useState } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { LoadingIndicator, Button, Input } from '@smarteam/ui';
import { ChevronRight, Crown, Plus, UserRoundCheck, UsersRound } from 'lucide-react';
import { useTeamDirectory } from '../../hooks/use-team-directory';
import type { TeamView } from '../../services/team-directory';
import { CreateTeamModal } from './create-team-modal';
import { TeamCard, TeamTable } from './team-views';
import { TeamDetailDrawer } from './team-detail-drawer';
import { PageShell } from '../layout/page-shell';
import { ScreenHeader } from '../common/screen-header';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

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
  const [metricFilter, setMetricFilter] = useState<'all' | 'members' | 'leads'>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Without the organization-wide permission the API sends only their own, and the "all"
  // view would be the same list under a misleading name.
  const source = scope === 'mine' || !directory.canReadAll ? directory.myTeams : directory.teams;
  const query = useDebouncedValue(search.trim()).toLowerCase();
  const filtered = source.filter((view) => {
    if (metricFilter === 'members' && view.activeMembers.length === 0) return false;
    if (metricFilter === 'leads' && !view.lead) return false;
    if (!query) return true;
    return (
      view.team.name.toLowerCase().includes(query) ||
      (view.branchName ?? '').toLowerCase().includes(query) ||
      (view.team.description ?? '').toLowerCase().includes(query) ||
      (view.lead?.displayName ?? '').toLowerCase().includes(query)
    );
  });
  const membershipCount = source.reduce((total, view) => total + view.activeMembers.length, 0);
  const leadCount = new Set(source.flatMap((view) => view.lead?.employeeId ?? [])).size;

  // Read from the live list so the drawer follows a refetch instead of holding a stale copy.
  const selectedTeam: TeamView | null =
    source.find((view) => view.team.id === selectedTeamId) ??
    directory.teams.find((view) => view.team.id === selectedTeamId) ??
    directory.myTeams.find((view) => view.team.id === selectedTeamId) ??
    null;

  return (
    <div className="relative flex w-full flex-col">
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
        <ScreenHeader
          actions={
            directory.canWrite && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-1.5 size-4" />
                New team
              </Button>
            )
          }
          icon={UsersRound}
          description="Organize people around shared goals."
          title="Teams"
          tone="primary"
        />
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-4">
            {(directory.canReadAll ? (['all', 'mine'] as const) : ([] as const)).map((value) => (
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
            {!directory.canReadAll && (
              <span className="pb-1 text-xs font-bold text-foreground">My teams</span>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <Input
              className="w-40 sm:w-52"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search teams"
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
          </div>
        </div>
      </div>

      <PageShell gap="none">
        {!directory.loading && !directory.error && !directory.forbidden && (
          <section aria-label="Team summary" className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              className={`rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metricFilter === 'all' ? 'border-primary/50 ring-1 ring-primary/15' : 'border-border'}`}
              onClick={() => setMetricFilter('all')}
              type="button"
              aria-pressed={metricFilter === 'all'}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-emerald-500/10 text-emerald-700">
                  <UsersRound className="size-4" />
                </span>
                <span className="text-xs font-medium text-foreground">Teams</span>
                <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
              </span>
              <span className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold leading-none tabular-nums">
                  {source.length}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {scope === 'mine' || !directory.canReadAll
                    ? 'Teams you can access'
                    : 'Active teams'}
                </span>
              </span>
            </button>
            <button
              className={`rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metricFilter === 'members' ? 'border-primary/50 ring-1 ring-primary/15' : 'border-border'}`}
              onClick={() => setMetricFilter(metricFilter === 'members' ? 'all' : 'members')}
              type="button"
              aria-pressed={metricFilter === 'members'}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-sky-500/10 text-sky-700">
                  <UserRoundCheck className="size-4" />
                </span>
                <span className="truncate text-xs font-medium text-foreground">
                  Active memberships
                </span>
                <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </span>
              <span className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold leading-none tabular-nums">
                  {membershipCount}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  Across listed teams · click to filter
                </span>
              </span>
            </button>
            <button
              className={`rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metricFilter === 'leads' ? 'border-primary/50 ring-1 ring-primary/15' : 'border-border'}`}
              onClick={() => setMetricFilter(metricFilter === 'leads' ? 'all' : 'leads')}
              type="button"
              aria-pressed={metricFilter === 'leads'}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-amber-500/10 text-amber-700">
                  <Crown className="size-4" />
                </span>
                <span className="text-xs font-medium text-foreground">Team leads</span>
                <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
              </span>
              <span className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold leading-none tabular-nums">{leadCount}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  Unique assigned leads · click to filter
                </span>
              </span>
            </button>
          </section>
        )}
        {directory.loading && (
          <LoadingIndicator
            variant="panel"
            label="Loading teams"
            className="py-10 text-center text-xs text-muted-foreground"
          />
        )}

        {!directory.loading && directory.forbidden && (
          <div
            className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
            role="status"
          >
            <p className="text-sm font-bold text-foreground">Not available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You do not have permission to view teams.
            </p>
          </div>
        )}

        {!directory.loading && directory.error && !directory.forbidden && (
          <div
            className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
            role="alert"
          >
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
          <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
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
      </PageShell>

      {selectedTeam && (
        <TeamDetailDrawer
          directory={directory}
          onClose={() => setSelectedTeamId(null)}
          team={selectedTeam}
        />
      )}

      <CreateTeamModal
        branches={directory.branches}
        existingNames={directory.teams.map((view) => view.team.name)}
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
