'use client';

import React, { useEffect } from 'react';
import { LoadingIndicator } from '@smarteam/ui';
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
import { OrganizationSetupPage } from './components/organization/organization-setup-page';
import { ScreenOnboarding } from './components/screen-onboarding/screen-onboarding';
import { ScreenLeaveAdmin } from './components/screen-leave/screen-leave-admin';
import { ScreenAttendanceAdmin } from './components/screen-attendance/screen-attendance-admin';
import { ScreenTimesheetsAdmin } from './components/screen-timesheet/screen-timesheets-admin';
import { ScreenPayrollAdmin } from './components/screen-payroll/screen-payroll-admin';
import { ScreenShifts } from './components/screen-shifts/screen-shifts';
import { ScreenReports } from './components/screen-reports/screen-reports';
import { ScreenHolidays } from './components/screen-holidays/screen-holidays';
import { ScreenEmployeeHolidays } from './components/screen-holidays/screen-employee-holidays';
import { ScreenEmployees } from './components/screen-employees/screen-employees';
import { RequiredPasswordChangeScreen } from './components/auth/required-password-change-screen';
import { SignedOutScreens, takeSignInPassword } from './components/auth/signed-out-screens';
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
  const {
    isAuthenticated,
    isRestoring,
    restoreFailed,
    retryRestore,
    login,
    logout,
    persona,
    canAccessSpace,
    canAccessModule,
    canSwitchWorkspace,
    switchWorkspace,
    workspaceContext,
  } = useSession();
  useTheme(); // Initialize and apply persisted theme (dark / light) on mount

  const {
    activeSpace,
    activeModule,
    attendanceViewMode,
    orgActiveTab,
    navigateToSpace,
    navigateToModule,
    setAttendanceViewMode,
  } = useEmsNavigation();

  // A space the URL asks for but the current workspace mode does not contain.
  //
  // Spaces are filtered by mode — Organization exists in ADMIN, My Space and Team in EMPLOYEE — so
  // an administrator whose last choice was the employee view followed an /?space=organization link
  // and silently landed on My Space instead. Switching the mode to match honours the link; someone
  // who cannot switch is unaffected and still falls back below.
  const requestedSpaceNeedsAdmin = activeSpace === 'Organization' && workspaceContext !== 'ADMIN';
  useEffect(() => {
    if (isAuthenticated && requestedSpaceNeedsAdmin && canSwitchWorkspace) switchWorkspace('ADMIN');
  }, [isAuthenticated, requestedSpaceNeedsAdmin, canSwitchWorkspace, switchWorkspace]);

  // Avoid flashing the sign-in screen while the session is being restored from the API.
  if (isRestoring) return <WorkspaceLoading />;

  // The session could not be checked at all; the sign-in page would wrongly say it had ended.
  if (restoreFailed) return <WorkspaceUnreachable onRetry={retryRestore} />;

  if (!isAuthenticated) return <SignedOutScreens onLogin={login} />;

  // Someone signed in with a password another person issued chooses their own before anything else.
  if (persona?.user.passwordChangeRequired)
    return (
      <RequiredPasswordChangeScreen
        email={persona.user.email}
        onSignOut={() => void logout()}
        temporaryPassword={takeSignInPassword()}
      />
    );

  // Safety fallback if active space is not permitted in current context
  const defaultFallbackSpace = workspaceContext === 'ADMIN' ? 'Organization' : 'My Space';
  const effectiveSpace = canAccessSpace(activeSpace) ? activeSpace : defaultFallbackSpace;
  // A module this space has no screen for (a shared link to My Space › Teams, say) opens the space's
  // home rather than an empty page.
  const hasScreen = effectiveSpace !== 'My Space' || MY_SPACE_MODULES.has(activeModule);
  const effectiveModule = canAccessModule(activeModule) && hasScreen ? activeModule : 'home';

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
            <OrganizationWorkspace onNavigateModule={navigateToModule} />
          )}

          {effectiveModule === 'onboarding' && <ScreenOnboarding />}
          {effectiveModule === 'org-setup' && <OrganizationSetupPage />}
          {effectiveModule === 'employees' && (
            <ScreenEmployees onNavigateModule={navigateToModule} />
          )}

          {effectiveModule === 'time-off' && <ScreenLeaveAdmin />}

          {effectiveModule === 'attendance' && <ScreenAttendanceAdmin />}

          {effectiveModule === 'timesheet' && <ScreenTimesheetsAdmin />}

          {effectiveModule === 'teams' && <ScreenTeams />}

          {effectiveModule === 'projects' && <ScreenProjects />}

          {effectiveModule === 'payroll' && (
            <ScreenPayrollAdmin onNavigateModule={navigateToModule} />
          )}

          {effectiveModule === 'shifts' && <ScreenShifts />}

          {effectiveModule === 'holidays' && <ScreenHolidays />}

          {effectiveModule === 'approvals' && <ScreenApprovals />}

          {effectiveModule === 'files' && <ScreenFiles />}
          {effectiveModule === 'reports' && <ScreenReports />}
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

          {effectiveModule === 'holidays' && <ScreenEmployeeHolidays />}

          {effectiveModule === 'projects' && <ScreenProjects />}

          {effectiveModule === 'payroll' && <ScreenPayroll />}

          {effectiveModule === 'approvals' && <ScreenApprovals />}

          {effectiveModule === 'files' && <ScreenFiles />}
          {effectiveModule === 'reports' && <ScreenReports />}
        </>
      )}
    </EmsLayout>
  );
}

/** The screens My Space has. Teams live in the Team space; administration in Organization. */
const MY_SPACE_MODULES = new Set<string>([
  'home',
  'attendance',
  'timesheet',
  'time-off',
  'holidays',
  'projects',
  'payroll',
  'approvals',
  'files',
]);

function WorkspaceUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0B1120] px-6 text-center">
      <p className="text-sm font-semibold text-white">Can&apos;t reach Smarteam right now</p>
      <p className="max-w-sm text-xs text-slate-400">
        You are still signed in. This is usually a busy moment or a dropped connection.
      </p>
      <button
        className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

function WorkspaceLoading() {
  return <LoadingIndicator variant="screen" label="Restoring your session" />;
}
