'use client';

import React, { useState, useEffect } from 'react';
import { EmsTopAppBar } from './ems-top-app-bar';
import { EmsLeftRail } from './ems-left-rail';
import { EmsMobileBottomNav } from './ems-mobile-bottom-nav';
import { ContextBar } from './context-bar';
import { CommandPalette } from './command-palette';
import { NotificationDrawer } from './notification-drawer';
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Global event listeners
  useEffect(() => {
    const handleOpenCommand = () => setIsCommandPaletteOpen(true);
    // The drawer loads the employee itself, so callers only need to name one.
    const handleOpenEmployee = (event: Event) => {
      // Typed as nullable because the event is a global bus any caller can dispatch on.
      const detail = (event as CustomEvent<{ employeeId?: string } | null>).detail;
      if (detail?.employeeId) setSelectedEmployeeId(detail.employeeId);
    };

    window.addEventListener('ems:open:command-palette', handleOpenCommand);
    window.addEventListener('ems:open:employee-drawer', handleOpenEmployee);
    return () => {
      window.removeEventListener('ems:open:command-palette', handleOpenCommand);
      window.removeEventListener('ems:open:employee-drawer', handleOpenEmployee);
    };
  }, []);

  const showLeftRail = activeSpace === 'My Space' || activeSpace === 'Organization';

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground antialiased overflow-hidden font-sans">
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
        onSelectEmployee={setSelectedEmployeeId}
      />

      {/* 5. Notifications Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />

      {/* 6. Entity Detail Drawer */}
      <EntityDetailDrawer
        employeeId={selectedEmployeeId}
        isOpen={!!selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
      />
    </div>
  );
}
