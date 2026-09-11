'use client';

import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  KeyRound,
  MapPin,
  Network,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TileTone } from '../common/module-tile';
import type { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import type { OrganizationState } from '../../hooks/use-organization';
import type { HolidaysState } from '../../hooks/use-holidays';

/**
 * Who this organization is, and its headline figures.
 *
 * Persistent: it sits beside every tab of the workspace rather than belonging to the Overview.
 * It used to be part of the Overview panel, so moving to People replaced the whole page — the
 * banner, the identity and the figures all disappeared and the tab felt like a different screen
 * rather than a different view of the same one.
 *
 * Every figure is counted from a response the API returned. One that could not be read says so;
 * "0 people" and "we could not read the people" look identical otherwise, and only one is a
 * reason to worry.
 */

const TONES: Record<TileTone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  neutral: 'bg-muted text-muted-foreground',
};

export function OrgIdentityRail({
  directory,
  holidays,
  organization,
}: {
  directory: ReturnType<typeof useEmployeeDirectory>;
  holidays: HolidaysState;
  organization: OrganizationState;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.holidays
    .filter((holiday) => holiday.isActive && holiday.holidayDate.slice(0, 10) >= today)
    .slice(0, 4);

  const name = organization.organization?.name ?? 'Organization';
  const active = directory.entries.filter((entry) => entry.status === 'ACTIVE').length;
  const withoutManager = directory.entries.filter((entry) => !entry.managerEmployeeId).length;
  const withoutLogin = directory.entries.filter((entry) => !entry.hasUserAccount).length;

  const peopleState = directory.forbidden ? 'No permission' : null;
  const peopleValue = (count: number) => (directory.loading ? null : String(count));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary text-xl font-bold text-primary-foreground"
          >
            {initialsOf(name)}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="truncate text-sm font-bold text-foreground">{name}</h2>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              {organization.organization?.timezone && (
                <span className="flex items-center gap-1">
                  <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{organization.organization.timezone}</span>
                </span>
              )}
              <span className="block">
                {organization.organization?.currencyCode ?? '--'} ·{' '}
                {organization.organization?.source === 'BLIZBOOKS' ? 'BlizBooks' : 'Native'}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <MiniStat
            icon={Users}
            label="People"
            tone="primary"
            unavailable={peopleState}
            value={peopleValue(directory.entries.length)}
          />
          <MiniStat
            icon={CheckCircle2}
            label="Active"
            tone="success"
            unavailable={peopleState}
            value={peopleValue(active)}
          />
          <MiniStat
            icon={Network}
            label="No manager"
            tone="warning"
            unavailable={peopleState}
            value={peopleValue(withoutManager)}
          />
          <MiniStat
            icon={KeyRound}
            label="No login"
            tone="accent"
            unavailable={peopleState}
            value={peopleValue(withoutLogin)}
          />
          <MiniStat
            icon={MapPin}
            label="Branches"
            tone="neutral"
            unavailable={organization.branchesForbidden ? 'No permission' : null}
            value={organization.loading ? null : String(organization.branches.length)}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <h2 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
          Upcoming holidays
        </h2>
        {holidays.forbidden ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            You do not have permission to view the holiday calendar.
          </p>
        ) : holidays.loading ? (
          <p className="mt-2 text-[11px] text-muted-foreground" role="status">
            Loading...
          </p>
        ) : upcoming.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No holidays are scheduled after today.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {upcoming.map((holiday) => (
              <li className="flex items-baseline justify-between gap-3 py-1.5" key={holiday.id}>
                <span className="min-w-0 truncate text-xs text-foreground">{holiday.name}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {holiday.holidayDate.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/**
 * A figure small enough to sit in the identity card. Loading and refused stay distinguishable:
 * `--` means "not yet", the word means "not allowed", and neither renders as a number.
 */
function MiniStat({
  icon: StatIcon,
  label,
  tone,
  unavailable,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: TileTone;
  unavailable: string | null;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${TONES[tone]}`}
      >
        <StatIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <dt className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd
          className={
            unavailable
              ? 'truncate text-[11px] text-muted-foreground'
              : 'font-mono text-sm font-semibold tabular-nums text-foreground'
          }
          title={unavailable ?? undefined}
        >
          {unavailable ?? value ?? '--'}
        </dd>
      </div>
    </div>
  );
}
