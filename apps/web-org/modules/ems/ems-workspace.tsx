'use client';

import React from 'react';
import { EmsLayout } from './components/layout/ems-layout';
import { Screen1Overview } from './components/screen-1-overview/screen-1-overview';
import { Screen2Timeline } from './components/screen-2-attendance/screen-2-timeline';
import { Screen3Table } from './components/screen-3-attendance-table/screen-3-table';
import { Screen4Calendar } from './components/screen-4-calendar/screen-4-calendar';
import { Screen5TimeTracker } from './components/screen-5-timetracker/screen-5-timetracker';
import { Screen7TimeOff } from './components/screen-7-timeoff/screen-7-timeoff';
import { ScreenTeams } from './components/screen-teams/screen-teams';
import { ScreenProjects } from './components/screen-projects/screen-projects';
import { ScreenPayroll } from './components/screen-payroll/screen-payroll';
import { ScreenApprovals } from './components/screen-approvals/screen-approvals';
import { ScreenFiles } from './components/screen-files/screen-files';
import { OrganizationWorkspace } from './components/organization/organization-workspace';
import { ScreenOnboarding } from './components/screen-onboarding/screen-onboarding';
import { ScreenLeaveAdmin } from './components/screen-leave/screen-leave-admin';
import { ScreenAttendanceAdmin } from './components/screen-attendance/screen-attendance-admin';
import { ScreenTimesheetsAdmin } from './components/screen-timesheet/screen-timesheets-admin';
import { ScreenPayrollAdmin } from './components/screen-payroll/screen-payroll-admin';
import { LoginScreen } from './components/auth/login-screen';
import { useEmsNavigation } from './hooks/use-ems-navigation';
import { AuthProvider, useSession } from './hooks/auth-context';
import { useTheme, ThemeProvider } from './hooks/use-theme';

export function EmsWorkspace() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <EmsWorkspaceInner />
      </AuthProvider>
    </ThemeProvider>
  );
}

function EmsWorkspaceInner() {
  // The shell is the one place the unauthenticated case is expected, so it reads the session
  // directly rather than through `useAuth`, which asserts a signed-in persona.
  const { isAuthenticated, isRestoring, login, canAccessSpace, canAccessModule, workspaceContext } =
    useSession();
  useTheme(); // Initialize and apply persisted theme (dark / light) on mount

  const {
    activeSpace,
    activeModule,
    attendanceViewMode,
    orgActiveTab,
    navigateToSpace,
    navigateToModule,
    navigateToOrgTab,
    setAttendanceViewMode,
  } = useEmsNavigation();

  // Avoid flashing the sign-in screen while the session is being restored from the API.
  if (isRestoring) return <WorkspaceLoading />;

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} />;
  }

  // Safety fallback if active space is not permitted in current context
  const defaultFallbackSpace = workspaceContext === 'ADMIN' ? 'Organization' : 'My Space';
  const effectiveSpace = canAccessSpace(activeSpace) ? activeSpace : defaultFallbackSpace;
  const effectiveModule = canAccessModule(activeModule) ? activeModule : 'home';

  return (
    <EmsLayout
      activeModule={effectiveModule}
      onSelectModule={navigateToModule}
      activeSpace={effectiveSpace}
      onSelectSpace={navigateToSpace}
      attendanceViewMode={attendanceViewMode}
      orgActiveTab={orgActiveTab}
    >
      {/* 1. Organization Space (Admin Governance Hub with Sidebar Modules) */}
      {effectiveSpace === 'Organization' && (
        <>
          {effectiveModule === 'home' && (
            <OrganizationWorkspace
              activeTab={orgActiveTab}
              onSelectTab={navigateToOrgTab}
              onNavigateModule={(moduleId) => {
                navigateToModule(moduleId);
              }}
            />
          )}

          {effectiveModule === 'onboarding' && <ScreenOnboarding />}

          {effectiveModule === 'time-off' && <ScreenLeaveAdmin />}

          {effectiveModule === 'attendance' && <ScreenAttendanceAdmin />}

          {effectiveModule === 'timesheet' && <ScreenTimesheetsAdmin />}

          {effectiveModule === 'teams' && <ScreenTeams />}

          {effectiveModule === 'projects' && <ScreenProjects />}

          {effectiveModule === 'payroll' && <ScreenPayrollAdmin />}

          {effectiveModule === 'approvals' && <ScreenApprovals />}

          {effectiveModule === 'files' && <ScreenFiles />}
        </>
      )}

      {/* 2. Team Space (Assigned Squad Roster) */}
      {effectiveSpace === 'Team' && <ScreenTeams />}

      {/* 3. My Space (Personal Self-Service Space with Side Navbar Modules) */}
      {effectiveSpace === 'My Space' && (
        <>
          {effectiveModule === 'home' && (
            <Screen1Overview
              onNavigateModule={(mod, sub) => {
                navigateToModule(mod, sub);
              }}
            />
          )}

          {effectiveModule === 'attendance' && (
            <>
              {attendanceViewMode === 'timeline' && (
                <Screen2Timeline onToggleView={setAttendanceViewMode} />
              )}
              {attendanceViewMode === 'table' && (
                <Screen3Table onToggleView={setAttendanceViewMode} />
              )}
              {attendanceViewMode === 'calendar' && (
                <Screen4Calendar onToggleView={setAttendanceViewMode} />
              )}
            </>
          )}

          {effectiveModule === 'timesheet' && <Screen5TimeTracker />}

          {effectiveModule === 'time-off' && <Screen7TimeOff />}

          {effectiveModule === 'projects' && <ScreenProjects />}

          {effectiveModule === 'payroll' && <ScreenPayroll />}

          {effectiveModule === 'approvals' && <ScreenApprovals />}

          {effectiveModule === 'files' && <ScreenFiles />}
        </>
      )}
    </EmsLayout>
  );
}

function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1120] text-sm text-slate-400">
      Restoring your session…
    </div>
  );
}
