'use client';

import { Button } from '@smarteam/ui';

import React from 'react';
import { useAuth } from '../../hooks/use-auth';

interface SubNavTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function SubNavTabs({ activeTab, onSelectTab }: SubNavTabsProps) {
  const { hasExplicitPermission } = useAuth();

  const isManagerApprover =
    hasExplicitPermission('leave.approve') ||
    hasExplicitPermission('timesheets.approve') ||
    hasExplicitPermission('attendance.approve');

  // Approvals is only in the tab list for actual line managers with explicit approval authority
  const tabs = [
    'Activities',
    'Feeds',
    'Profile',
    ...(isManagerApprover ? ['Approvals'] : []),
    'Leave',
    'Attendance',
    'Time Logs',
    'Timesheets',
  ];

  return (
    <div className="bg-white dark:bg-card rounded-[6px] border border-slate-200 dark:border-border px-3 sm:px-4 h-11 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)] w-full max-w-full">
      <div className="flex items-center space-x-4 sm:space-x-6 h-full overflow-x-auto no-scrollbar py-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
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

      <Button
        variant="ghost"
        size="icon"
        className="p-1 text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors shrink-0 ml-2 cursor-pointer h-7 w-7"
        title="View Settings / Filters"
        aria-label="Filter"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      </Button>
    </div>
  );
}
