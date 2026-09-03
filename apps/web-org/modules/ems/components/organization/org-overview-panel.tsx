'use client';

import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  KeyRound,
  MapPin,
  Network,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { BotanicalCover } from '../layout/botanical-cover';
import { ModuleTile, type TileTone } from '../common/module-tile';
import type { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import type { OrganizationState } from '../../hooks/use-organization';
import type { HolidaysState } from '../../hooks/use-holidays';

/**
 * The organization at a glance.
 *
 * Laid out as two columns under a banner: a narrow left rail carrying who this organization is
 * and what its calendar looks like, and a wide right panel carrying the modules. The rail is
 * reference; the panel is what you came to do, so it gets the width.
 *
 * An earlier pass flattened this into a settings form, on the reasoning that the cover image,
 * announcements, milestones and quick links had no backing entity. True of that *content*, and
 * not a reason to throw away the *shape*.
 *
 * Every value here is real: the identity is the organization record, the figures are counted from
 * responses the API returned, the holidays are the holiday calendar, and each tile navigates to a
 * module that exists. A figure that could not be read says so — "0 people" and "we could not read
 * the people" look identical otherwise, and only one is a reason to worry.
 *
 * Still absent, because nothing stores them: the cover *photo* (the banner is drawn, not
 * uploaded), announcements, milestones and user-configurable quick links.
 */

type Shortcut = { module: string; label: string; detail: string; icon: LucideIcon; tone: TileTone };

const SHORTCUTS: Shortcut[] = [
  {
    module: 'onboarding',
    label: 'Onboarding',
    detail: 'Bring a new employee in',
    icon: UserPlus,
    tone: 'primary',
  },
  {
    module: 'time-off',
    label: 'Leave',
    detail: 'Requests, balances and types',
    icon: CalendarDays,
    tone: 'accent',
  },
  {
    module: 'attendance',
    label: 'Attendance',
    detail: 'Records and corrections',
    icon: Clock3,
    tone: 'success',
  },
  {
    module: 'timesheet',
    label: 'Timesheets',
    detail: 'Submitted and approved',
    icon: FileText,
    tone: 'accent',
  },
  {
    module: 'payroll',
    label: 'Payroll',
    detail: 'Runs, structure and statutory',
    icon: Wallet,
    tone: 'warning',
  },
  { module: 'teams', label: 'Teams', detail: 'Membership and leads', icon: Users, tone: 'primary' },
  {
    module: 'projects',
    label: 'Projects',
    detail: 'Allocation and members',
    icon: FolderKanban,
    tone: 'accent',
  },
  {
    module: 'holidays',
    label: 'Holidays',
    detail: 'The organization calendar',
    icon: CalendarDays,
    tone: 'success',
  },
  {
    module: 'approvals',
    label: 'Approvals',
    detail: 'Routing policies',
    icon: CheckCircle2,
    tone: 'success',
  },
  { module: 'files', label: 'Files', detail: 'Stored documents', icon: FileText, tone: 'neutral' },
];

const TONES: Record<TileTone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  neutral: 'bg-muted text-muted-foreground',
};

export function OrgOverviewPanel({
  directory,
  holidays,
  onNavigateModule,
  organization,
}: {
  directory: ReturnType<typeof useEmployeeDirectory>;
  holidays: HolidaysState;
  onNavigateModule?: (module: string) => void;
  organization: OrganizationState;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.holidays
    .filter((holiday) => holiday.isActive && holiday.holidayDate.slice(0, 10) >= today)
    .slice(0, 5);

  const name = organization.organization?.name ?? 'Organization';
  const active = directory.entries.filter((entry) => entry.status === 'ACTIVE').length;
  const withoutManager = directory.entries.filter((entry) => !entry.managerEmployeeId).length;
  const withoutLogin = directory.entries.filter((entry) => !entry.hasUserAccount).length;

  // Loading and refused are different answers and must not collapse into one. `--` says "not yet";
  // the word says "not allowed".
  const peopleState = directory.forbidden ? 'No permission' : null;
  const peopleValue = (count: number) => (directory.loading ? null : String(count));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <BotanicalCover heightClass="h-28 sm:h-36" />
      </div>

      {/*
        Both columns are pulled up to overlap the banner's lower edge.
        `relative z-10` is what makes them sit *on* the banner rather than under it: the banner
        clips its own artwork with `overflow-hidden`, which gives it a paint order the negative
        margin alone does not beat, so the tops of these cards were being covered.
      */}
      <div className="relative z-10 -mt-10 grid gap-4 lg:grid-cols-3">
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

        {/* The workspace, given the width because it is what the page is for. */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-2xs lg:col-span-2">
          <h2 className="text-xs font-bold text-foreground">Go to</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The modules this workspace manages. Each opens its own screen.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {SHORTCUTS.map((shortcut) => (
              <ModuleTile
                detail={shortcut.detail}
                icon={shortcut.icon}
                key={shortcut.module}
                label={shortcut.label}
                onClick={() => onNavigateModule?.(shortcut.module)}
                tone={shortcut.tone}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * A figure small enough to sit inside the identity card.
 *
 * Loading and refused stay distinguishable at this size too: `--` means "not yet", the word means
 * "not allowed", and neither is ever rendered as a number.
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
