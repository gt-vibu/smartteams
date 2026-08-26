'use client';

import React, { useState } from 'react';
import { EmsLayout } from './components/layout/ems-layout';
import { Screen1Overview } from './components/screen-1-overview/screen-1-overview';
import { Screen2Timeline } from './components/screen-2-attendance/screen-2-timeline';
import { Screen3Table } from './components/screen-3-attendance-table/screen-3-table';
import { Screen4Calendar } from './components/screen-4-calendar/screen-4-calendar';
import { Screen5TimeTracker } from './components/screen-5-timetracker/screen-5-timetracker';
import { Screen7TimeOff } from './components/screen-7-timeoff/screen-7-timeoff';
import { ScreenTeams } from './components/screen-teams/screen-teams';
import { ScreenProjects } from './components/screen-projects/screen-projects';

type ActiveModule = 'home' | 'attendance' | 'timesheet' | 'time-off' | 'teams' | 'projects';

export function EmsWorkspace() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('home');
  const [activeSpace, setActiveSpace] = useState('My Space');
  const [attendanceViewMode, setAttendanceViewMode] = useState<'timeline' | 'table' | 'calendar'>('timeline');

  return (
    <EmsLayout
      activeModule={activeModule}
      onSelectModule={(mod) => setActiveModule(mod as ActiveModule)}
      activeSpace={activeSpace}
      onSelectSpace={setActiveSpace}
    >
      {activeModule === 'home' && (
        <Screen1Overview
          onNavigateModule={(mod, sub) => {
            setActiveModule(mod as ActiveModule);
            if (sub) setAttendanceViewMode(sub);
          }}
        />
      )}

      {activeModule === 'attendance' && (
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

      {activeModule === 'timesheet' && (
        <Screen5TimeTracker />
      )}

      {activeModule === 'time-off' && (
        <Screen7TimeOff />
      )}

      {activeModule === 'teams' && (
        <ScreenTeams />
      )}

      {activeModule === 'projects' && (
        <ScreenProjects />
      )}
    </EmsLayout>
  );
}


