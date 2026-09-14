'use client';

import React, { useCallback } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/use-media-query';
import { HeroBanner } from './hero-banner';
import { EmployeeProfilePanel } from './employee-profile-panel';
import { SubNavTabs } from './sub-nav-tabs';
import { OverviewActivitiesTab } from './overview-activities-tab';
import { OverviewProfileTab } from './overview-profile-tab';
import { OverviewApprovalsTab } from './overview-approvals-tab';
import { OverviewDashboardTab } from './overview-dashboard-tab';
import { OverviewLeavePreviewTab } from './overview-leave-preview-tab';
import { OverviewAttendancePreviewTab } from './overview-attendance-preview-tab';
import { OverviewTimesheetPreviewTab } from './overview-timesheet-preview-tab';
import { OverviewCompact, type CompactSection } from './overview-compact';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { PageShell } from '../layout/page-shell';

const TOP_TABS = ['Overview', 'Dashboard', 'Calendar'] as const;

/**
 * 'Approvals' stays in this list even though only a line manager sees the control: rejecting it
 * for everyone else would mean a manager's shared link landed silently on the default tab.
 * 'Time Logs' stays for the same reason — it is no longer a tab of its own, but links name it.
 */
const SUB_TABS = [
  'Activities',
  'Profile',
  'Approvals',
  'Leave',
  'Attendance',
  'Time Logs',
  'Timesheets',
] as const;

const TOP_TAB_KEY = 'overviewTab';
const SUB_TAB_KEY = 'overviewSection';

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

interface Screen1OverviewProps {
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen1Overview({ onNavigateModule }: Screen1OverviewProps) {
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  // Home opens on Activities beside the profile on a laptop, and on the profile itself on a phone,
  // where the two cannot share the screen.
  const subFallback = isWide ? 'Activities' : 'Profile';

  // Two independent levels, each its own history entry: moving through the sub-tabs and then
  // pressing Back returns to the previous sub-tab rather than leaving the screen.
  const [activeTopTab, setActiveTopTab] = useScreenTab(TOP_TAB_KEY, TOP_TABS, 'Overview');
  const [activeSubTab, setActiveSubTab] = useScreenTab(SUB_TAB_KEY, SUB_TABS, subFallback);

  /**
   * The phone strip mixes the two levels — Dashboard is a top tab, Activities a sub-tab — so one
   * tap can change both parameters. Two setter calls would push two history entries and Back
   * would stop on a state nobody chose; this writes both at once and lets the tab hooks re-read
   * the URL through the same `popstate` they already listen for.
   */
  const selectCompactSection = useCallback(
    (section: CompactSection) => {
      const params = new URLSearchParams(window.location.search);
      const top = section === 'Dashboard' || section === 'Calendar' ? section : 'Overview';
      if (top === 'Overview') params.delete(TOP_TAB_KEY);
      else params.set(TOP_TAB_KEY, top);
      if (top === 'Overview' && section !== subFallback) params.set(SUB_TAB_KEY, section);
      else params.delete(SUB_TAB_KEY);
      const query = params.toString();
      window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    [subFallback],
  );

  if (!isWide) {
    const section: CompactSection =
      activeTopTab !== 'Overview'
        ? activeTopTab
        : activeSubTab === 'Time Logs'
          ? 'Timesheets'
          : activeSubTab;
    return (
      <OverviewCompact
        section={section}
        onSelectSection={selectCompactSection}
        onNavigateModule={onNavigateModule}
      />
    );
  }

  // The tab name arrives from a child as a plain string, so it is checked against the list
  // rather than asserted. An unknown name is ignored instead of blanking the screen.
  const handleSelectSubTab = (tab: string) => {
    if (isOneOf(tab, SUB_TABS)) setActiveSubTab(tab);
  };
  const handleSelectTopTab = (tab: string) => {
    if (isOneOf(tab, TOP_TABS)) setActiveTopTab(tab);
  };

  return (
    <div className="w-full max-w-full pb-14 bg-background min-h-full">
      <HeroBanner activeTab={activeTopTab} onSelectTab={handleSelectTopTab} />

      {activeTopTab === 'Calendar' ? (
        <PageShell>
          <Screen4Calendar />
        </PageShell>
      ) : (
        <PageShell className="relative z-20 -mt-16" gap="none">
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-4 xl:col-span-3">
              <EmployeeProfilePanel />
            </div>

            <div className="col-span-8 xl:col-span-9 space-y-4 min-w-0">
              {activeTopTab === 'Dashboard' ? (
                <OverviewDashboardTab onNavigateModule={onNavigateModule} />
              ) : (
                <>
                  <SubNavTabs activeTab={activeSubTab} onSelectTab={handleSelectSubTab} />
                  {activeSubTab === 'Activities' && <OverviewActivitiesTab />}
                  {activeSubTab === 'Profile' && <OverviewProfileTab />}
                  {activeSubTab === 'Approvals' && <OverviewApprovalsTab />}
                  {activeSubTab === 'Leave' && <OverviewLeavePreviewTab />}
                  {activeSubTab === 'Attendance' && <OverviewAttendancePreviewTab />}
                  {(activeSubTab === 'Time Logs' || activeSubTab === 'Timesheets') && (
                    <OverviewTimesheetPreviewTab />
                  )}
                </>
              )}
            </div>
          </div>
        </PageShell>
      )}
    </div>
  );
}
