'use client';

import React from 'react';
import { Badge, Progress } from '@smarteam/ui';
import type { ProjectView } from '../../services/team-directory';

/**
 * Project roster presentation.
 *
 * Team capacity reflects average allocation across assigned active members.
 * For example, 7 full-time members allocated at 100% capacity each displays 100% average capacity.
 */
export function averageAllocation(view: ProjectView): number {
  if (view.activeMembers.length === 0) return 0;
  const sum = view.activeMembers.reduce((acc, m) => acc + (m.allocationPercentage ?? 100), 0);
  return Math.round(sum / view.activeMembers.length);
}

/** Legacy alias returning bounded capacity percentage */
export function totalAllocation(view: ProjectView): number {
  return averageAllocation(view);
}

export function ProjectCard({ view, onClick }: { view: ProjectView; onClick: () => void }) {
  const avg = averageAllocation(view);
  const count = view.activeMembers.length;

  return (
    <button
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 cursor-pointer"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{view.project.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {view.project.code ?? '--'} · {view.branchName ?? 'No branch'}
          </p>
        </div>
        <Badge variant="outline">{view.project.status ?? 'UNKNOWN'}</Badge>
      </div>

      {view.project.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{view.project.description}</p>
      )}

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {count} {count === 1 ? 'member' : 'members'} allocated
          </span>
          <span className="font-mono font-bold text-foreground">{avg}%</span>
        </div>
        <Progress aria-label={`Team average allocation ${avg}%`} value={avg} />
      </div>
    </button>
  );
}

export function ProjectTable({
  views,
  onSelect,
}: {
  views: ProjectView[];
  onSelect: (view: ProjectView) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Project</th>
            <th className="px-4 py-2.5 font-bold">Code</th>
            <th className="px-4 py-2.5 font-bold">Branch</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
            <th className="px-4 py-2.5 font-bold">Allocated</th>
          </tr>
        </thead>
        <tbody>
          {views.map((view) => (
            <tr
              className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={view.project.id}
              onClick={() => onSelect(view)}
            >
              <td data-cell="primary" className="px-4 py-2.5 font-semibold text-foreground">
                {view.project.name}
              </td>
              <td data-label="Code" className="px-4 py-2.5 font-mono text-muted-foreground">
                {view.project.code ?? '--'}
              </td>
              <td data-label="Branch" className="px-4 py-2.5 text-muted-foreground">
                {view.branchName ?? '--'}
              </td>
              <td data-label="Status" className="px-4 py-2.5 text-muted-foreground">
                {view.project.status ?? '--'}
              </td>
              <td
                data-label="Allocated"
                className="px-4 py-2.5 font-mono font-bold text-foreground"
              >
                {view.activeMembers.length} {view.activeMembers.length === 1 ? 'member' : 'members'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
