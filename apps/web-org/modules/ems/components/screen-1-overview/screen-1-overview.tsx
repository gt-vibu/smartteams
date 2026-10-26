'use client';

import React, { useCallback } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { scrollCanvasToTop, useScreenTab } from '../../hooks/use-screen-tab';
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
import { compactSectionUrl } from './compact-navigation';

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
  // Desktop keeps the activity feed beside the profile. Phones open on the employee profile.
  const subFallback = isWide ? 'Activities' : 'Profile';

  // Two independent levels, each its own history entry: moving through the sub-tabs and then
  // pressing Back returns to the previous sub-tab rather than leaving the screen.
  const [activeTopTab, setActiveTopTab] = useScreenTab(
    TOP_TAB_KEY,
    TOP_TABS,
    'Overview',
  );
  const [requestedSubTab, setActiveSubTab] = useScreenTab(SUB_TAB_KEY, SUB_TABS, subFallback);
  // A link or a remembered tab can name a preview this person may not read; it opens on the
  // default instead of on a refusal.
  const { canAccessModule } = useAuth();
  const previewModule: Partial<Record<(typeof SUB_TABS)[number], string>> = {
    Approvals: 'approvals',
    Leave: 'time-off',
    Attendance: 'attendance',
    'Time Logs': 'timesheet',
    Timesheets: 'timesheet',
  };
  const requiredModule = previewModule[requestedSubTab];
  const activeSubTab =
    requiredModule && !canAccessModule(requiredModule) ? subFallback : requestedSubTab;

  /** Write the compact home tab as a single history entry. */
  const selectCompactSection = useCallback(
    (section: CompactSection) => {
      // Compact sections live under Overview. Persist Overview explicitly because the mobile
      // fallback is itself Overview; deleting the key would fall back to Dashboard and make
      // “My week” appear to do nothing.
      window.history.pushState(
        null,
        '',
        compactSectionUrl(section, window.location.search, window.location.pathname, subFallback),
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
      scrollCanvasToTop();
    },
    [subFallback],
  );

  if (!isWide) {
    // Ignore legacy desktop overviewTab=Dashboard links on phones. The compact home has only
    // Profile and My week tabs; selecting either always normalizes the URL to Overview.
    const section: CompactSection = activeSubTab === 'Time Logs' ? 'Timesheets' : activeSubTab;
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
        // The calendar lays out its own page; a second shell around it doubled the margins and
        // left its month bar out of line with the grid.
        <Screen4Calendar embedded />
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
                  {activeSubTab === 'Activities' && (
                    <OverviewActivitiesTab onNavigateModule={onNavigateModule} />
                  )}
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
