'use client';

import React from 'react';
import { Badge, Progress } from '@smarteam/ui';
import type { ProjectView } from '../../services/team-directory';

/**
 * Project roster presentation.
 *
 * Allocation percentages are the values the API stored. Where an allocation was never recorded
 * the cell reads `--` rather than 0%, because "not recorded" and "zero capacity" are different
 * facts and the roster must not turn one into the other.
 */

export function totalAllocation(view: ProjectView): number {
  return view.activeMembers.reduce((sum, member) => sum + (member.allocationPercentage ?? 0), 0);
}

export function ProjectCard({ view, onClick }: { view: ProjectView; onClick: () => void }) {
  return (
    <button
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
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
          <span>{view.activeMembers.length} allocated</span>
          <span className="font-mono font-bold text-foreground">{totalAllocation(view)}%</span>
        </div>
        <Progress
          aria-label={`Total allocation ${totalAllocation(view)}%`}
          value={Math.min(totalAllocation(view), 100)}
        />
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
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40">
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
              className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40 hover:bg-muted/40"
              key={view.project.id}
              onClick={() => onSelect(view)}
            >
              <td className="px-4 py-2.5 font-semibold text-foreground">{view.project.name}</td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {view.project.code ?? '--'}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{view.branchName ?? '--'}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{view.project.status ?? '--'}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-foreground">
                {view.activeMembers.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
