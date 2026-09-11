'use client';

import React from 'react';
import type { CommandItem } from './command-palette-types';

/**
 * The fixed part of the command palette: navigation targets and actions.
 *
 * Lifted out of the palette component because it was 250 lines of literal data wedged between
 * the keyboard handling and the rendering, which made all three harder to follow. People and
 * projects are not here — those come from the API at render time and belong with the component
 * that fetches them.
 */
/**
 * Which module each command opens or acts on.
 *
 * Kept next to the commands themselves so the two cannot drift: the palette filters against this
 * map and withholds anything missing from it, so a command added without an entry is hidden
 * rather than shown to everybody. `command-palette.test.ts` asserts every id built below appears
 * here, which is the check that would have caught the ten unmapped commands this replaced.
 */
export const COMMAND_MODULE_BY_ID: Record<string, string> = {
  'nav-home': 'home',
  'nav-attendance': 'attendance',
  'nav-time-off': 'time-off',
  'nav-timesheet': 'timesheet',
  'nav-projects': 'projects',
  'nav-payroll': 'payroll',
  'nav-approvals': 'approvals',
  'nav-team': 'teams',
  'nav-admin-team': 'teams',
  'nav-admin-org': 'home',
  'act-punch': 'attendance',
  'act-leave': 'time-off',
  'act-logtime': 'timesheet',
  'act-admin-payroll': 'payroll',
  'act-admin-leave-policy': 'time-off',
  'act-admin-attendance-roster': 'attendance',
};

export function buildCommandItems({
  canAccessModule,
  checkIn,
  checkOut,
  isAssignedToAnyTeam,
  isCheckedIn,
  onClose,
  onNavigateModule,
  onNavigateSpace,
  workspaceContext,
}: {
  canAccessModule: (module: string) => boolean;
  /** Both are async; the palette fires and forgets, so the return type must admit a promise. */
  checkIn: () => unknown;
  checkOut: () => unknown;
  isAssignedToAnyTeam: boolean;
  isCheckedIn: boolean;
  onClose: () => void;
  onNavigateModule: (module: string) => void;
  onNavigateSpace: (space: string) => void;
  workspaceContext: string;
}): CommandItem[] {
  // Build command items filtered by active operating workspace context and permissions
  const allItems: CommandItem[] = [];

  if (workspaceContext === 'ADMIN') {
    // ── Admin Actions ────────────────────────────────────────────────────────
    allItems.push(
      {
        id: 'act-admin-payroll',
        title: 'Start New Payroll Run',
        subtitle: 'Initiate monthly compensation run and calculation',
        category: 'Actions',
        icon: <span className="text-sky-500">💳</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'act-admin-leave-policy',
        title: 'Create Leave Policy',
        subtitle: 'Configure annual allowance, accrual frequency & branch rules',
        category: 'Actions',
        icon: <span className="text-purple-500">🌴</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'act-admin-attendance-roster',
        title: 'Inspect Attendance Daily Roster',
        subtitle: 'Filter organizational daily presence and punch logs',
        category: 'Actions',
        icon: <span className="text-emerald-500">⏱️</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      // ── Admin Navigation ──────────────────────────────────────────────────
      {
        id: 'nav-admin-org',
        title: 'Go to Organization Hub',
        subtitle: 'Department directory, hierarchy & branches',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">🏢</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'nav-admin-team',
        title: 'Go to Team Workspace',
        subtitle: 'View team squads and structure',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">👥</span>,
        onSelect: () => {
          onNavigateSpace('Team');
          onClose();
        },
      },
    );
  } else {
    // ── Employee Actions ────────────────────────────────────────────────────
    allItems.push(
      {
        id: 'act-punch',
        title: isCheckedIn ? 'Check Out of Attendance' : 'Check In to Attendance',
        subtitle: isCheckedIn ? 'Stop active session timer' : 'Start attendance timer',
        category: 'Actions',
        icon: (
          <svg
            className="h-4 w-4 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
        onSelect: () => {
          // The API records the punch itself; there is no note field on a punch.
          if (isCheckedIn) void checkOut();
          else void checkIn();
          onClose();
        },
      },
      {
        id: 'act-logtime',
        title: 'Log Work Time to Project',
        subtitle: 'Record time entry on active timesheet',
        category: 'Actions',
        icon: (
          <svg
            className="h-4 w-4 text-sky-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        ),
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('timesheet');
          onClose();
        },
      },
      {
        id: 'act-leave',
        title: 'Apply for Leave / Time Off',
        subtitle: 'Submit casual or sick leave request',
        category: 'Actions',
        icon: (
          <svg
            className="h-4 w-4 text-purple-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ),
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('time-off');
          onClose();
        },
      },
      // ── Employee Navigation (Side Navbar Modules) ─────────────────────────
      {
        id: 'nav-home',
        title: 'Overview (Home)',
        subtitle: 'Personal dashboard, presence, and schedule',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">🏠</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('home');
          onClose();
        },
      },
      {
        id: 'nav-attendance',
        title: 'Attendance (Side Nav)',
        subtitle: 'Daily check-in timeline and attendance calendar',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">⏱️</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('attendance');
          onClose();
        },
      },
      {
        id: 'nav-time-off',
        title: 'Time Off / Leave (Side Nav)',
        subtitle: 'Personal leave balances & applications',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">🌴</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('time-off');
          onClose();
        },
      },
      {
        id: 'nav-timesheet',
        title: 'Timesheet Tracker (Side Nav)',
        subtitle: 'Weekly timesheet logs and timers',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">📅</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('timesheet');
          onClose();
        },
      },
      {
        id: 'nav-projects',
        title: 'Projects (Side Nav)',
        subtitle: 'Assigned project delivery squads',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">📂</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('projects');
          onClose();
        },
      },
      {
        id: 'nav-payroll',
        title: 'Payroll / Payslips (Side Nav)',
        subtitle: 'Salary structure and payslip history',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">💳</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('payroll');
          onClose();
        },
      },
    );

    if (canAccessModule('approvals')) {
      allItems.push({
        id: 'nav-approvals',
        title: 'Approvals Center (Side Nav)',
        subtitle: 'Sign-off pending team leave and timesheet requests',
        category: 'Navigation',
        badge: 'Manager',
        icon: <span className="text-muted-foreground">✅</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('approvals');
          onClose();
        },
      });
    }

    if (isAssignedToAnyTeam) {
      allItems.push({
        id: 'nav-team',
        title: 'Team Space (Top Nav)',
        subtitle: 'View assigned squad roster and team topology',
        category: 'Navigation',
        icon: <span className="text-muted-foreground">👥</span>,
        onSelect: () => {
          onNavigateSpace('Team');
          onClose();
        },
      });
    }
  }

  return allItems;
}
