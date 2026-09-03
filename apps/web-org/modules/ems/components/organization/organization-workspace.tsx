'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@smarteam/ui';
import { useOrganization } from '../../hooks/use-organization';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { useHolidays } from '../../hooks/use-holidays';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { BotanicalCover } from '../layout/botanical-cover';
import { OrgProfilePanel, Unavailable } from './org-profile-panel';
import { OrgBranchesPanel } from './org-branches-panel';
import { OrgShortcuts } from './org-shortcuts';
import { OrgIdentityRail } from './org-identity-rail';
import { OrgPeoplePanel } from './org-people-panel';

const TABS = [
  'overview',
  'people',
  'departments',
  'reporting',
  'branches',
  'profile',
  'unavailable',
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
  const [tab, setTab] = useScreenTab<Tab>('orgSection', TABS, 'overview');

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
    { id: 'profile', label: 'Profile' },
    { id: 'unavailable', label: 'Not available' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1380px] px-4 pb-6 sm:px-6">
      {/*
        Sticky. The tab bar is how you move around this screen, so it should not scroll away as
        soon as the content below it gets long. The negative margin lets the background span the
        full width while the text stays aligned with the page.
      */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 pt-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
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

        <div className="mt-3 flex items-center gap-4 overflow-x-auto">
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
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <BotanicalCover heightClass="h-24 sm:h-32" />
      </div>

      {/* The rail is part of the shell; only the panel beside it belongs to the active tab. */}
      <div className="relative z-10 -mt-8 grid gap-4 lg:grid-cols-3">
        <OrgIdentityRail directory={directory} holidays={holidays} organization={organization} />

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
          {tab === 'profile' && <OrgProfilePanel organization={organization} />}
          {tab === 'unavailable' && <BackendCapabilityGaps />}
        </div>
      </div>
    </div>
  );
}

/**
 * What the backend still does not hold.
 *
 * Shorter than it was: departments, the reporting hierarchy and headcount left this list once a
 * native directory projection made them readable. What remains has no entity at all.
 */
function BackendCapabilityGaps() {
  const items = [
    { title: 'Announcements', detail: 'No announcement entity exists.' },
    {
      title: 'Milestones',
      detail: 'No milestone entity exists. Company milestones were previously sample data.',
    },
    {
      title: 'Quick links',
      detail:
        'Previously stored per browser, so a link one person added was invisible to everyone else. Navigation lives in the sidebar; configurable links are not organization data the backend holds.',
    },
    {
      title: 'Cover image and branding',
      detail:
        'No asset is stored against an organization. A cover image was previously a data URL in one browser.',
    },
    {
      title: 'Department as an entity',
      detail:
        'Departments are grouped from the free-text field on each employment record, which is why one exists exactly as long as someone is in it. There is no department to rename, own or archive.',
    },
  ];

  return (
    <div className="space-y-3">
      <Unavailable
        detail="Each of these is a backend capability gap rather than a missing screen. They are listed with the reason, rather than shown with sample data."
        title="Not currently available"
      />
      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {items.map((item) => (
          <div className="px-4 py-3" key={item.title}>
            <dt className="text-xs font-bold text-foreground">{item.title}</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
