'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { Building2 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useOrganization } from '../../hooks/use-organization';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { useHolidays } from '../../hooks/use-holidays';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { OrgProfilePanel, Unavailable } from './org-profile-panel';
import { OrgBranchesPanel } from './org-branches-panel';
import { OrgOverviewPanel } from './org-overview-panel';
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
 * A first pass reduced this to Profile, Branches and a list of capability gaps, on the reasoning
 * that the ten tabs it replaced were built on `organization.json` and four `localStorage` keys.
 * That was right about the fixtures and wrong about the conclusion: four of those tabs describe
 * data the product genuinely holds, and removing them lost real capability along with the fake.
 *
 * They are back, on real reads. Overview counts what the API returned; People, Departments and
 * Reporting all derive from one directory request rather than one per employee. Announcements,
 * milestones, quick links and the cover image are not back, because nothing stores them — those
 * stay listed under "Not available" with the reason.
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
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        description="People, structure and configuration for this tenant."
        icon={Building2}
        title={organization.organization?.name ?? 'Organization'}
        tone="primary"
      />

      <div className="flex items-center gap-4 overflow-x-auto border-b border-border pb-2">
        {tabs.map((entry) => (
          <Button
            className={`shrink-0 rounded-none pb-1 text-xs font-semibold ${
              tab === entry.id
                ? 'border-b-2 border-foreground font-bold text-foreground'
                : 'text-muted-foreground'
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

      {tab === 'overview' && (
        <OrgOverviewPanel
          directory={directory}
          holidays={holidays}
          onNavigateModule={onNavigateModule}
          organization={organization}
        />
      )}
      {tab === 'people' && <OrgPeoplePanel directory={directory} view="directory" />}
      {tab === 'departments' && <OrgPeoplePanel directory={directory} view="departments" />}
      {tab === 'reporting' && <OrgPeoplePanel directory={directory} view="reporting" />}
      {tab === 'branches' && <OrgBranchesPanel organization={organization} />}
      {tab === 'profile' && <OrgProfilePanel organization={organization} />}
      {tab === 'unavailable' && <BackendCapabilityGaps />}
    </div>
  );
}

/**
 * What the backend still does not hold.
 *
 * Shorter than it was, because departments, the reporting hierarchy and headcount left this list
 * when a native directory projection made them readable. What remains has no entity at all — and
 * is listed with the reason rather than shown with sample data.
 */
function BackendCapabilityGaps() {
  const items = [
    {
      title: 'Announcements',
      detail: 'No announcement entity exists.',
    },
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
      {/* A one-column list, not a two-column grid: an odd number of entries left a dead grey
          cell hanging off the end, which read as a broken tile rather than as "that is all". */}
      <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
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
