'use client';

import React, { useState, useEffect } from 'react';
import { EmsTopAppBar } from './ems-top-app-bar';
import { EmsLeftRail } from './ems-left-rail';
import { EmsMobileBottomNav } from './ems-mobile-bottom-nav';
import { ContextBar } from './context-bar';
import { CommandPalette } from './command-palette';
import { NotificationDrawer } from './notification-drawer';
import type { EmployeeDetailData } from '../common/entity-detail-drawer';
import { EntityDetailDrawer } from '../common/entity-detail-drawer';

interface EmsLayoutProps {
  children: React.ReactNode;
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace: string;
  onSelectSpace: (space: string) => void;
  attendanceViewMode?: string;
  orgActiveTab?: string;
}

export function EmsLayout({
  children,
  activeModule,
  onSelectModule,
  activeSpace,
  onSelectSpace,
  attendanceViewMode,
  orgActiveTab,
}: EmsLayoutProps) {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<EmployeeDetailData | null>(
    null,
  );

  // Global event listeners
  useEffect(() => {
    const handleOpenCommand = () => setIsCommandPaletteOpen(true);
    const handleOpenEmployee = (event: Event) => {
      const detail = (event as CustomEvent<EmployeeDetailData>).detail;
      setSelectedEmployeeDetail(detail);
    };

    window.addEventListener('ems:open:command-palette', handleOpenCommand);
    window.addEventListener('ems:open:employee-drawer', handleOpenEmployee);
    return () => {
      window.removeEventListener('ems:open:command-palette', handleOpenCommand);
      window.removeEventListener('ems:open:employee-drawer', handleOpenEmployee);
    };
  }, []);

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmployeeDetail({
      id: empId,
      employeeNumber: empId === 'emp_009' ? 'EMP-009' : empId === 'emp_064' ? 'EMP-064' : 'EMP-040',
      firstName: empId === 'emp_009' ? 'Ranjith' : empId === 'emp_064' ? 'Mithun' : 'Vikramaditya',
      lastName: empId === 'emp_009' ? 'Kumar C' : empId === 'emp_064' ? 'Gowda H' : 'Sengupta',
      workEmail: `${empId}@smarteam.cloud`,
      jobTitle:
        empId === 'emp_009'
          ? 'Engineering Manager'
          : empId === 'emp_064'
            ? 'Software Engineer'
            : 'VP of People Ops',
      department: 'Engineering & Technology',
      branchName: 'HQ – Bengaluru',
      avatarInitials: empId === 'emp_009' ? 'RK' : empId === 'emp_064' ? 'MG' : 'VS',
      avatarUrl: null,
      status: 'ACTIVE',
      manager:
        empId === 'emp_064'
          ? {
              id: 'emp_009',
              employeeNumber: 'EMP-009',
              firstName: 'Ranjith',
              lastName: 'Kumar C',
              jobTitle: 'Engineering Manager',
            }
          : null,
      teams: [
        { id: 'team-1', name: 'Frontend Engineering', isLead: empId === 'emp_009' },
        { id: 'team-2', name: 'Platform Core', isLead: false },
      ],
      projects: [
        {
          id: 'proj-1',
          code: 'LUX-2026',
          name: 'Luxasia 2026',
          role: 'Frontend Lead',
          allocationPercentage: 60,
        },
        {
          id: 'proj-2',
          code: 'SMAR-EMS',
          name: 'Smarteam EMS Redesign',
          role: 'Architect',
          allocationPercentage: 40,
        },
      ],
      directReports:
        empId === 'emp_009'
          ? [
              {
                id: 'emp_064',
                employeeNumber: 'EMP-064',
                name: 'Mithun Gowda H',
                jobTitle: 'Software Engineer',
              },
              {
                id: 'emp-001',
                employeeNumber: 'EMP-001',
                name: 'Arjun Das',
                jobTitle: 'QA Engineer',
              },
            ]
          : undefined,
    });
  };

  const showLeftRail = activeSpace === 'My Space' || activeSpace === 'Organization';

  return (
    <div className="h-screen w-full flex flex-col bg-background text-slate-800 antialiased overflow-hidden font-sans">
      {/* 1. Global Top App Bar */}
      <EmsTopAppBar
        activeSpace={activeSpace}
        onSelectSpace={onSelectSpace}
        onOpenSearch={() => setIsCommandPaletteOpen(true)}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
      />

      {/* 2. Workspace Body (Left Rail + Main Canvas) */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative bg-slate-100 dark:bg-background">
        {/* Desktop Left Rail (hidden on mobile — bottom nav handles mobile) */}
        {showLeftRail && (
          <div className="hidden md:flex shrink-0 h-full">
            <EmsLeftRail
              activeModule={activeModule}
              onSelectModule={onSelectModule}
              activeSpace={activeSpace}
            />
          </div>
        )}

        {/* Dedicated Scrollable Main Content Canvas with Context Bar */}
        <main
          id="ems-main-canvas"
          className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-[72px] md:pb-6 relative scroll-smooth focus:outline-none flex flex-col bg-slate-50 dark:bg-background"
        >
          {/* Context Breadcrumbs & Scope Indicator */}
          <ContextBar
            activeSpace={activeSpace}
            activeModule={activeModule}
            attendanceViewMode={attendanceViewMode}
            orgActiveTab={orgActiveTab}
            onNavigateSpace={onSelectSpace}
            onNavigateModule={onSelectModule}
          />

          <div className="flex-1 min-w-0 px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5 max-w-[1400px] w-full mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* 3. Mobile Bottom Navigation (replaces hamburger drawer on mobile) */}
      {showLeftRail && (
        <EmsMobileBottomNav
          activeModule={activeModule}
          onSelectModule={onSelectModule}
          activeSpace={activeSpace}
        />
      )}

      {/* 4. Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigateModule={onSelectModule}
        onNavigateSpace={onSelectSpace}
        onSelectEmployee={handleSelectEmployee}
      />

      {/* 5. Notifications Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />

      {/* 6. Entity Detail Drawer */}
      <EntityDetailDrawer
        isOpen={!!selectedEmployeeDetail}
        onClose={() => setSelectedEmployeeDetail(null)}
        employee={selectedEmployeeDetail}
      />
    </div>
  );
}
