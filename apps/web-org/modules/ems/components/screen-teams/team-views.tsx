'use client';

import React from 'react';
import { Badge } from '@smarteam/ui';
import type { TeamView } from '../../services/team-directory';

/**
 * Roster presentation for the teams screen.
 *
 * Member job titles are absent on purpose: they live on employment records, one request per
 * employee, which a roster cannot issue. The employee drawer shows them.
 */

function MemberAvatars({ team }: { team: TeamView }) {
  const shown = team.activeMembers.slice(0, 5);
  const extra = team.activeMembers.length - shown.length;
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((member) => (
        // Opaque under the tint: the circles overlap, and a see-through one let the next cover
        // the previous one's second letter.
        <span
          className="rounded-full border-2 border-card bg-card"
          key={member.memberId}
          title={member.displayName}
        >
          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary dark:bg-emerald-400/15 dark:text-emerald-200">
            {member.initials}
          </span>
        </span>
      ))}
      {extra > 0 && (
        <span className="grid size-7 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-muted-foreground">
          +{extra}
        </span>
      )}
      {team.activeMembers.length === 0 && (
        <span className="text-xs text-muted-foreground">No members</span>
      )}
    </div>
  );
}

export function TeamCard({ team, onClick }: { team: TeamView; onClick: () => void }) {
  return (
    <button
      aria-label={`Open ${team.team.name} team details`}
      aria-haspopup="dialog"
      className="group flex w-full cursor-pointer flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{team.team.name}</p>
          {team.branchName && (
            <p className="truncate text-xs text-muted-foreground">{team.branchName}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">
            {team.activeMembers.length} {team.activeMembers.length === 1 ? 'member' : 'members'}
          </Badge>
          <span aria-hidden="true" className="text-muted-foreground transition-transform group-hover:translate-x-0.5">›</span>
        </div>
      </div>

      {team.team.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{team.team.description}</p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <MemberAvatars team={team} />
        <div className="flex min-w-0 flex-col items-end gap-1">
          <span className="max-w-full truncate text-[11px] text-muted-foreground">
            {team.lead ? `Lead: ${team.lead.displayName}` : 'No lead'}
          </span>
          <span className="text-[10px] font-semibold text-primary">View team →</span>
        </div>
      </div>
    </button>
  );
}

export function TeamTable({
  teams,
  onSelect,
}: {
  teams: TeamView[];
  onSelect: (team: TeamView) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Team</th>
            <th className="px-4 py-2.5 font-bold">Branch</th>
            <th className="px-4 py-2.5 font-bold">Lead</th>
            <th className="px-4 py-2.5 font-bold">Members</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr
              className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40 hover:bg-muted/40"
              key={team.team.id}
              onClick={() => onSelect(team)}
            >
              <td data-cell="primary" className="px-4 py-2.5 font-semibold text-foreground">
                {team.team.name}
              </td>
              <td data-label="Branch" className="px-4 py-2.5 text-muted-foreground">
                {team.branchName ?? '—'}
              </td>
              <td data-label="Lead" className="px-4 py-2.5 text-muted-foreground">
                {team.lead?.displayName ?? '—'}
              </td>
              <td
                data-label="Members"
                className="px-4 py-2.5 font-semibold tabular-nums text-foreground"
              >
                {team.activeMembers.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
