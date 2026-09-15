'use client';

import { Button } from '@smarteam/ui';

import React from 'react';
import { useAuth } from '../../hooks/use-auth';
import { APPROVAL_DECISION_PERMISSIONS } from '../../services/authorization.policy';

interface SubNavTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

/**
 * Whether the Approvals tab belongs on Home: only for a line manager with explicit authority to
 * decide something. One rule for the laptop and phone strips, so they cannot disagree.
 */
export function useIsManagerApprover(): boolean {
  const { hasExplicitPermission } = useAuth();
  return APPROVAL_DECISION_PERMISSIONS.some((permission) => hasExplicitPermission(permission));
}

export function SubNavTabs({ activeTab, onSelectTab }: SubNavTabsProps) {
  const isManagerApprover = useIsManagerApprover();

  // "Time Logs" and "Timesheets" were both here and rendered the same component, so the strip
  // offered two tabs that were one page. A link naming "Time Logs" still opens it (see
  // `screen-1-overview`), and marks this tab as the current one.
  const tabs = [
    'Activities',
    // 'Feeds', // Commented out until real backend persistence is connected
    'Profile',
    ...(isManagerApprover ? ['Approvals'] : []),
    'Leave',
    'Attendance',
    'Timesheets',
  ];
  const current = activeTab === 'Time Logs' ? 'Timesheets' : activeTab;

  return (
    <div className="bg-white dark:bg-card rounded-[6px] border border-slate-200 dark:border-border px-3 sm:px-4 h-11 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)] w-full max-w-full">
      <div className="flex items-center space-x-4 sm:space-x-6 h-full overflow-x-auto no-scrollbar py-1">
        {tabs.map((tab) => {
          const isActive = current === tab;
          return (
            <Button
              key={tab}
              variant="ghost"
              size="sm"
              onClick={() => onSelectTab(tab)}
              className={`h-full text-xs font-semibold px-1 flex items-center whitespace-nowrap transition-colors relative cursor-pointer shrink-0 rounded-none ${
                isActive
                  ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
