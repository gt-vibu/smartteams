'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import { useTeams } from '../../hooks/use-teams';

interface ContextBarProps {
  activeSpace: string;
  activeModule: string;
  attendanceViewMode?: string;
  orgActiveTab?: string;
  onNavigateSpace?: (space: string) => void;
  onNavigateModule?: (module: string) => void;
}

export function ContextBar({
  activeSpace,
  activeModule,
  attendanceViewMode,
  orgActiveTab,
  onNavigateSpace,
  onNavigateModule,
}: ContextBarProps) {
  const { persona, workspaceContext } = useAuth();
  const { primaryTeam } = useTeams();

  const getModuleLabel = (mod: string) => {
    switch (mod) {
      case 'home':
        return 'Overview';
      case 'attendance':
        return `Attendance (${attendanceViewMode === 'timeline' ? 'Timeline' : attendanceViewMode === 'table' ? 'Table View' : 'Calendar'})`;
      case 'timesheet':
        return 'Timesheet & Time Tracker';
      case 'time-off':
        return 'Time Off & Leave Balances';
      case 'projects':
        return 'Projects & Work Allocations';
      case 'payroll':
        return 'Payroll & Payslips';
      case 'approvals':
        return 'Managerial Approvals';
      case 'files':
        return 'Files & Documents Vault';
      default:
        return mod.charAt(0).toUpperCase() + mod.slice(1);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-card border-b border-slate-200/80 dark:border-border px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0 select-none min-w-0">
      {/* Left: Breadcrumbs Path */}
      <nav
        aria-label="Context Breadcrumbs"
        className="flex items-center space-x-1.5 min-w-0 flex-1 overflow-hidden"
      >
        <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">Smarteam</span>
        <span className="text-slate-300 dark:text-slate-600 shrink-0">/</span>

        {/* Space */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigateSpace?.(activeSpace)}
          className="h-auto p-1 text-xs hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer transition-colors text-slate-600 dark:text-slate-300"
        >
          {activeSpace}
        </Button>

        {/* Module in My Space */}
        {activeSpace === 'My Space' && (
          <>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateModule?.(activeModule)}
              className="h-auto p-1 text-xs text-slate-900 dark:text-white font-semibold truncate hover:underline cursor-pointer"
            >
              {getModuleLabel(activeModule)}
            </Button>
          </>
        )}

        {/* Team Sub-path */}
        {activeSpace === 'Team' && (
          <>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-slate-900 dark:text-white font-semibold truncate">
              {primaryTeam ? primaryTeam.name : 'Assigned Squads'}
            </span>
          </>
        )}

        {/* Organization Sub-path */}
        {activeSpace === 'Organization' && (
          <>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-slate-900 dark:text-white font-semibold truncate">
              {activeModule && activeModule !== 'home'
                ? activeModule === 'onboarding'
                  ? 'Onboarding'
                  : activeModule === 'time-off'
                    ? 'Leave Operations'
                    : activeModule === 'attendance'
                      ? 'Attendance'
                      : activeModule === 'timesheet'
                        ? 'Time Logs'
                        : activeModule === 'teams'
                          ? 'Teams & Squads'
                          : activeModule === 'projects'
                            ? 'Projects'
                            : activeModule === 'payroll'
                              ? 'Payroll'
                              : activeModule === 'approvals'
                                ? 'Approvals'
                                : 'Files Vault'
                : orgActiveTab || 'Overview'}
            </span>
          </>
        )}
      </nav>

      {/* Right: Operational Scope Indicator */}
      <div className="hidden sm:flex items-center space-x-2 shrink-0">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Context:</span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-100 dark:bg-card text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[var(--border)]">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          {workspaceContext === 'ADMIN'
            ? 'Admin Workspace (Governance)'
            : activeSpace === 'Team' && primaryTeam
              ? `Team: ${primaryTeam.name}`
              : `Employee (${persona.name})`}
        </span>
      </div>
    </div>
  );
}
