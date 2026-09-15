'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@smarteam/ui';
import { useOrganization } from '../../hooks/use-organization';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { useHolidays } from '../../hooks/use-holidays';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/use-media-query';
import { BotanicalCover } from '../layout/botanical-cover';
import { OrgProfilePanel } from './org-profile-panel';
import { OrgBranchesPanel } from './org-branches-panel';
import { OrgShortcuts } from './org-shortcuts';
import { OrgIdentityRail } from './org-identity-rail';
import { OrgPeoplePanel } from './org-people-panel';
import { OrgAccessPanel } from './org-access-panel';
import { useAuth } from '../../hooks/use-auth';
import { hasPermission } from '@smarteam/contracts';
import { PageBleed, PageShell } from '../layout/page-shell';

const TABS = [
  'overview',
  'people',
  'departments',
  'reporting',
  'branches',
  'access',
  'profile',
] as const;

type Tab = (typeof TABS)[number];

/**
 * The organization workspace.
 *
 * One screen with several views, not several screens. The banner, the identity card and the
 * headline figures are part of the shell and stay put; only the right-hand panel changes with the
 * tab. They previously belonged to the Overview tab, so moving to People replaced everything and
 * each tab read as a separate page that happened to share a heading.
 *
 * The tabs are summaries by design. They answer "what does this organization look like" — the
 * first handful of people, how the departments divide, who reports to whom — while the modules in
 * the sidebar hold the full lists and the actions. A tab that tried to be the whole screen would
 * only duplicate one of those.
 */
export function OrganizationWorkspace({
  onNavigateModule,
}: {
  onNavigateModule?: (module: string) => void;
}) {
  const organization = useOrganization();
  const directory = useEmployeeDirectory();
  const holidays = useHolidays();
  const { persona } = useAuth();
  const [tab, setTab] = useScreenTab<Tab>('orgSection', TABS, 'overview');
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  // On a phone the organization's card and cover belong to Overview alone. Below `lg` they used
  // to stack above every tab, so People or Branches opened on a screen of someone else's subject.
  const showIdentity = isWide || tab === 'overview';

  // Absent rather than disabled for a caller who can read neither members nor roles — an
  // organization with nothing behind the tab is not worth a click that only reports "forbidden".
  const canSeeAccess =
    hasPermission(persona.permissions, 'members.read') ||
    hasPermission(persona.permissions, 'rbac.read');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    {
      id: 'people',
      label: `People${directory.entries.length ? ` (${directory.entries.length})` : ''}`,
    },
    { id: 'departments', label: 'Departments' },
    { id: 'reporting', label: 'Reporting' },
    {
      id: 'branches',
      label: `Branches${organization.branches.length ? ` (${organization.branches.length})` : ''}`,
    },
    ...(canSeeAccess ? [{ id: 'access' as const, label: 'Access' }] : []),
    { id: 'profile', label: 'Profile' },
  ];

  return (
    <PageShell gap="none">
      {/*
        Sticky. The tab bar is how you move around this screen, so it should not scroll away as
        soon as the content below it gets long. `PageBleed` lets the rule and its backdrop reach
        the page edges while the heading stays on the same left edge as the content below —
        previously a hand-kept `-mx-4 sm:-mx-6` that matched the screen's own gutter but not the
        shell's, so the header and the content it sat above were aligned to different columns.
      */}
      <PageBleed className="sticky top-[var(--ems-context-bar-height)] z-20 border-b border-border bg-background/95 pt-4 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          >
            <Building2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-foreground">
              {organization.organization?.name ?? 'Organization'}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              People, structure and configuration for this tenant.
            </p>
          </div>
        </div>

        {/* Seven sections do not fit across a phone. There they are a native picker — the OS
            opens its own sheet — rather than a strip that pans sideways. */}
        <label className="mt-3 block pb-3 lg:hidden">
          <span className="sr-only">Section</span>
          <select
            value={tab}
            onChange={(event) => setTab(event.target.value as Tab)}
            className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground"
          >
            {tabs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 hidden items-center gap-4 lg:flex">
          {tabs.map((entry) => (
            <Button
              className={`shrink-0 rounded-none border-b-2 pb-2 text-xs font-semibold ${
                tab === entry.id
                  ? 'border-foreground font-bold text-foreground'
                  : 'border-transparent text-muted-foreground'
              }`}
              key={entry.id}
              onClick={() => setTab(entry.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </PageBleed>

      {showIdentity && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <BotanicalCover heightClass="h-24 sm:h-32" />
        </div>
      )}

      {/* The rail is part of the shell; only the panel beside it belongs to the active tab. */}
      <div className={`relative z-10 grid gap-4 lg:grid-cols-3 ${showIdentity ? '-mt-8' : 'mt-4'}`}>
        {showIdentity && (
          <OrgIdentityRail directory={directory} holidays={holidays} organization={organization} />
        )}

        <div className="lg:col-span-2">
          {tab === 'overview' && <OrgShortcuts onNavigateModule={onNavigateModule} />}
          {tab === 'people' && (
            <OrgPeoplePanel
              directory={directory}
              onNavigateModule={onNavigateModule}
              view="directory"
            />
          )}
          {tab === 'departments' && (
            <OrgPeoplePanel
              directory={directory}
              onNavigateModule={onNavigateModule}
              view="departments"
            />
          )}
          {tab === 'reporting' && (
            <OrgPeoplePanel
              directory={directory}
              onNavigateModule={onNavigateModule}
              view="reporting"
            />
          )}
          {tab === 'branches' && <OrgBranchesPanel organization={organization} />}
          {tab === 'access' && <OrgAccessPanel />}
          {tab === 'profile' && <OrgProfilePanel organization={organization} />}
        </div>
      </div>
    </PageShell>
  );
}
