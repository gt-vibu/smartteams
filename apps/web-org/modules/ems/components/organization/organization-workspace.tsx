'use client';

import React, { useState } from 'react';
import { useOrganization } from '../../hooks/use-organization';
import { OrgHeroBanner } from './org-hero-banner';
import { OrgOverviewTab } from './org-overview-tab';
import { OrgDepartmentDirectoryTab } from './org-department-directory-tab';
import { OrgEmployeeTreeTab } from './org-employee-tree-tab';
import { OrgDepartmentTreeTab } from './org-department-tree-tab';
import { OrgAnnouncementsTab } from './org-announcements-tab';
import { OrgPoliciesTab } from './org-policies-tab';
import { OrgMilestonesTab } from './org-milestones-tab';
import { OrgCalendarTab } from './org-calendar-tab';
import { ScreenAttendanceAdmin } from '../screen-attendance/screen-attendance-admin';
import { ScreenLeaveAdmin } from '../screen-leave/screen-leave-admin';
import { ScreenTimesheetsAdmin } from '../screen-timesheet/screen-timesheets-admin';
import { ScreenPayrollAdmin } from '../screen-payroll/screen-payroll-admin';

interface OrganizationWorkspaceProps {
  onNavigateModule?: (module: string, subView?: string) => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export function OrganizationWorkspace({
  onNavigateModule,
  activeTab: controlledTab,
  onSelectTab: controlledSelectTab,
}: OrganizationWorkspaceProps) {
  const [internalTab, setInternalTab] = useState('Overview');
  const activeTab = controlledTab || internalTab;
  const setActiveTab = controlledSelectTab || setInternalTab;
  const {
    organization,
    branches,
    departments,
    orgHierarchyTree,
    approvalPolicies,
    announcements,
    milestones,
    quickLinks,
    updateCoverUrl,
    addAnnouncement,
    addQuickLink,
    removeQuickLink,
  } = useOrganization();

  return (
    <div className="w-full max-w-full pb-14 bg-background dark:bg-background min-h-full">
      {/* 1. Full-Width Botanical Cover Hero Banner + Sticky Sub-Nav */}
      <OrgHeroBanner
        organization={organization}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onUpdateCoverUrl={updateCoverUrl}
      />

      {/* 2. Sub-View Body */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 -mt-16 relative z-20">
        {/* Tab 1: Overview */}
        {activeTab === 'Overview' && (
          <OrgOverviewTab
            organization={organization}
            branches={branches}
            quickLinks={quickLinks}
            onNavigateModule={onNavigateModule}
            onSelectSubTab={setActiveTab}
            onAddQuickLink={addQuickLink}
            onRemoveQuickLink={removeQuickLink}
          />
        )}

        {/* Tab 2: Department Directory */}
        {activeTab === 'Department Directory' && (
          <div className="pt-3">
            <OrgDepartmentDirectoryTab departments={departments} />
          </div>
        )}

        {/* Tab 3: Employee Tree (Org Hierarchy) */}
        {activeTab === 'Employee Tree' && (
          <div className="pt-3">
            <OrgEmployeeTreeTab treeRoot={orgHierarchyTree} />
          </div>
        )}

        {/* Tab 4: Attendance Operations */}
        {activeTab === 'Attendance Operations' && (
          <div className="pt-3">
            <ScreenAttendanceAdmin />
          </div>
        )}

        {/* Tab 5: Leave Policies & Approvals */}
        {activeTab === 'Leave Policies & Approvals' && (
          <div className="pt-3">
            <ScreenLeaveAdmin />
          </div>
        )}

        {/* Tab 6: Timesheets Audit */}
        {activeTab === 'Timesheets Audit' && (
          <div className="pt-3">
            <ScreenTimesheetsAdmin />
          </div>
        )}

        {/* Tab 7: Payroll Runs */}
        {activeTab === 'Payroll Runs' && (
          <div className="pt-3">
            <ScreenPayrollAdmin />
          </div>
        )}

        {/* Tab 8: Department Tree */}
        {activeTab === 'Department Tree' && (
          <div className="pt-3">
            <OrgDepartmentTreeTab departments={departments} />
          </div>
        )}

        {/* Tab 9: Announcements */}
        {activeTab === 'Announcements' && (
          <div className="pt-3">
            <OrgAnnouncementsTab
              announcements={announcements}
              onAddAnnouncement={addAnnouncement}
            />
          </div>
        )}

        {/* Tab 10: Policies */}
        {activeTab === 'Policies' && (
          <div className="pt-3">
            <OrgPoliciesTab approvalPolicies={approvalPolicies} />
          </div>
        )}

        {/* Tab 11: Milestones (Birthdays & New Hires) */}
        {activeTab === 'New Hires & Birthdays' && (
          <div className="pt-3">
            <OrgMilestonesTab milestones={milestones} />
          </div>
        )}

        {/* Tab 12: Calendar (Holidays) */}
        {activeTab === 'Calendar' && (
          <div className="pt-3">
            <OrgCalendarTab />
          </div>
        )}
      </div>
    </div>
  );
}
