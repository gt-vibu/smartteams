'use client';

import { useState, useEffect, useCallback } from 'react';

export type EmsSpace = 'My Space' | 'Team' | 'Organization';

export type EmsModule =
  | 'home'
  | 'onboarding'
  | 'attendance'
  | 'timesheet'
  | 'time-off'
  | 'teams'
  | 'projects'
  | 'payroll'
  | 'shifts'
  | 'holidays'
  | 'approvals'
  | 'files';

export type AttendanceViewMode = 'timeline' | 'table' | 'calendar';

export interface EmsNavState {
  space: EmsSpace;
  module: EmsModule;
  attendanceView: AttendanceViewMode;
  orgTab: string;
}

const VALID_MODULES: EmsModule[] = [
  'home',
  'onboarding',
  'attendance',
  'timesheet',
  'time-off',
  'teams',
  'projects',
  'payroll',
  'shifts',
  'holidays',
  'approvals',
  'files',
];

function parseUrlParams(): EmsNavState {
  if (typeof window === 'undefined') {
    return {
      space: 'My Space',
      module: 'home',
      attendanceView: 'timeline',
      orgTab: 'Overview',
    };
  }

  const params = new URLSearchParams(window.location.search);
  const spaceParam = params.get('space');
  const moduleParam = params.get('module');
  const viewParam = params.get('view');
  const tabParam = params.get('tab');

  let space: EmsSpace = 'My Space';
  if (spaceParam === 'organization' || spaceParam === 'Organization') {
    space = 'Organization';
  } else if (
    spaceParam === 'team' ||
    spaceParam === 'Team' ||
    spaceParam === 'teams' ||
    spaceParam === 'Teams'
  ) {
    space = 'Team';
  }

  let module: EmsModule = 'home';
  if (moduleParam && VALID_MODULES.includes(moduleParam as EmsModule)) {
    module = moduleParam as EmsModule;
  } else if (moduleParam === 'leave') {
    module = 'time-off';
  }

  const attendanceView: AttendanceViewMode =
    viewParam === 'table' || viewParam === 'calendar' ? viewParam : 'timeline';

  const orgTab = tabParam || 'Overview';

  return {
    space,
    module,
    attendanceView,
    orgTab,
  };
}

function buildUrl(state: EmsNavState): string {
  const params = new URLSearchParams();
  if (state.space === 'Organization') {
    params.set('space', 'organization');
    if (state.module !== 'home') {
      params.set('module', state.module);
    }
    if (state.orgTab && state.orgTab !== 'Overview') {
      params.set('tab', state.orgTab);
    }
  } else if (state.space === 'Team') {
    params.set('space', 'team');
  } else {
    params.set('space', 'my-space');
    if (state.module !== 'home') {
      params.set('module', state.module);
    }
    if (state.module === 'attendance' && state.attendanceView !== 'timeline') {
      params.set('view', state.attendanceView);
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : window.location.pathname;
}

export function useEmsNavigation() {
  const [navState, setNavState] = useState<EmsNavState>(() => parseUrlParams());

  // Push new state to history stack
  const pushNavState = useCallback((nextState: Partial<EmsNavState>) => {
    setNavState((current) => {
      const merged: EmsNavState = { ...current, ...nextState };
      const newUrl = buildUrl(merged);
      if (
        typeof window !== 'undefined' &&
        window.location.search !== newUrl.replace(/^[^?]*/, '')
      ) {
        window.history.pushState(merged, '', newUrl);
      }
      return merged;
    });
  }, []);

  // Listen to browser Back / Forward events
  useEffect(() => {
    const handlePopState = () => {
      const restoredState = parseUrlParams();
      setNavState(restoredState);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToSpace = useCallback(
    (space: string) => {
      let targetSpace: EmsSpace = 'My Space';
      if (space === 'Organization') targetSpace = 'Organization';
      else if (space === 'Team' || space === 'Teams') targetSpace = 'Team';

      pushNavState({
        space: targetSpace,
        module: 'home',
        orgTab: 'Overview',
      });
    },
    [pushNavState],
  );

  const navigateToModule = useCallback(
    (moduleName: string, subView?: AttendanceViewMode) => {
      let normalizedModule: EmsModule = 'home';
      if (moduleName === 'leave' || moduleName === 'time-off') normalizedModule = 'time-off';
      else if (VALID_MODULES.includes(moduleName as EmsModule))
        normalizedModule = moduleName as EmsModule;

      pushNavState({
        // Team is a single screen with no modules, so a module chosen from it — the phone's
        // bottom bar is available there — is a module of My Space. Merging it into Team would
        // change the URL and nothing on screen.
        ...(navState.space === 'Team' ? { space: 'My Space' as const } : {}),
        module: normalizedModule,
        ...(subView ? { attendanceView: subView } : {}),
      });
    },
    [pushNavState, navState.space],
  );

  const navigateToOrgTab = useCallback(
    (tab: string) => {
      pushNavState({
        space: 'Organization',
        orgTab: tab,
      });
    },
    [pushNavState],
  );

  const setAttendanceViewMode = useCallback(
    (viewMode: AttendanceViewMode) => {
      pushNavState({
        attendanceView: viewMode,
      });
    },
    [pushNavState],
  );

  return {
    activeSpace: navState.space,
    activeModule: navState.module,
    attendanceViewMode: navState.attendanceView,
    orgActiveTab: navState.orgTab,
    navigateToSpace,
    navigateToModule,
    navigateToOrgTab,
    setAttendanceViewMode,
  };
}
