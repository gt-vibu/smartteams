'use client';

import { LoadingIndicator } from '@smarteam/ui';

import React from 'react';
import { formatWorkMinutes } from '@smarteam/contracts';
import { useTimesheet } from '../../hooks/use-timesheet';

const BAR_COLOURS = ['bg-primary', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-violet-500'];

/**
 * Hours on the current timesheet, split by project, from the entries actually logged.
 *
 * It showed three invented projects with fixed hours to everyone, including organizations with no
 * projects at all. Time logged without a project is shown as such rather than dropped.
 */
export function ProjectHoursCard() {
  const { current, projects, loading } = useTimesheet();
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const totals = new Map<string, number>();
  for (const entry of current?.entries ?? []) {
    const key = entry.projectId ?? '';
    totals.set(key, (totals.get(key) ?? 0) + entry.minutes);
  }
  const all = [...totals.values()].reduce((sum, minutes) => sum + minutes, 0);
  const rows = [...totals.entries()]
    .map(([id, minutes]) => ({
      id,
      name: id ? (names.get(id) ?? 'Project') : 'No project',
      minutes,
      share: all > 0 ? Math.round((minutes / all) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="lg:col-span-7 bg-card rounded-[6px] border border-border p-5 shadow-xs space-y-4">
      <h4 className="text-xs font-bold text-foreground">Project hours</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {loading ? <LoadingIndicator variant="inline" label="Loading project hours" /> : 'No time logged on this timesheet yet.'}
        </p>
      ) : (
        <div className="space-y-3 text-xs">
          {rows.map((row, index) => (
            <div key={row.id || 'none'}>
              <div className="flex justify-between gap-3 font-medium text-foreground mb-1">
                <span className="truncate">{row.name}</span>
                <span className="font-mono font-semibold shrink-0">
                  {formatWorkMinutes(row.minutes)} ({row.share}%)
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`${BAR_COLOURS[index % BAR_COLOURS.length]} h-2 rounded-full`}
                  style={{ width: `${row.share}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
