'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import { useMyTeams } from '../../hooks/use-teams';

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
  const { primaryTeam } = useMyTeams();

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
    <div className="sticky top-0 z-30 h-[var(--ems-context-bar-height)] w-full shrink-0 select-none border-b border-border bg-background/95 px-3 text-xs text-muted-foreground backdrop-blur-sm sm:px-6 flex min-w-0 items-center justify-between gap-2">
      {/* Left: Breadcrumbs Path */}
      <nav
        aria-label="Context Breadcrumbs"
        className="flex items-center space-x-1.5 min-w-0 flex-1 overflow-hidden"
      >
        <span className="font-semibold text-foreground shrink-0">Smarteam</span>
        <span className="text-muted-foreground/50 shrink-0">/</span>

        {/* Space */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigateSpace?.(activeSpace)}
          className="h-auto p-1 text-xs hover:text-foreground font-medium cursor-pointer transition-colors text-muted-foreground"
        >
          {activeSpace}
        </Button>

        {/* Module in My Space */}
        {activeSpace === 'My Space' && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateModule?.(activeModule)}
              className="h-auto p-1 text-xs text-foreground font-semibold truncate hover:underline cursor-pointer"
            >
              {getModuleLabel(activeModule)}
            </Button>
          </>
        )}

        {/* Team Sub-path */}
        {activeSpace === 'Team' && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-semibold truncate">
              {primaryTeam ? primaryTeam.name : 'Assigned Squads'}
            </span>
          </>
        )}

        {/* Organization Sub-path */}
        {activeSpace === 'Organization' && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-semibold truncate">
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
        <span className="text-[11px] text-muted-foreground">Context:</span>
        <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
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
