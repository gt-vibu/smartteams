'use client';

import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ModuleTile, type TileTone } from '../common/module-tile';

/**
 * Where to go from here.
 *
 * The Overview tab's job: name the modules this workspace manages and get out of the way. The
 * figures live in the rail beside it, and the data lives on the module screens — this is
 * navigation, not a dashboard.
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

export function OrgShortcuts({
  onNavigateModule,
}: {
  onNavigateModule?: (module: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
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
  );
}
