'use client';

import React, { useState, useEffect } from 'react';
import { EmsTopAppBar } from './ems-top-app-bar';
import { EmsLeftRail } from './ems-left-rail';
import { EmsMobileBottomNav } from './ems-mobile-bottom-nav';
import { ContextBar } from './context-bar';
import { CommandPalette } from './command-palette';
import { HolidayCheckInPrompt } from '../common/holiday-check-in-prompt';
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
    <div className="h-dvh w-full flex flex-col bg-background text-foreground antialiased overflow-hidden font-sans">
      {/* 1. Global Top App Bar */}
      <EmsTopAppBar
        activeSpace={activeSpace}
        onSelectSpace={onSelectSpace}
        onOpenSearch={() => setIsCommandPaletteOpen(true)}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
      />

      {/*
        2. Workspace Body (Left Rail + Main Canvas)

        One page ground, not three. This and the canvas below each used to paint their own
        near-white — so the page was a cream base, with a grey sheet on it, with a lighter sheet
        on that, and only then the content. Every card therefore read as floating on a panel
        rather than sitting on the page, which is the "detached component" feeling. Both now
        inherit, so content sits directly on the background.
      */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
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
          className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 relative scroll-smooth focus:outline-none flex flex-col"
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

          {/*
            The scroll canvas only. Width, gutters and rhythm belong to `PageShell`, which each
            screen renders — this used to set them too, so every screen's own container nested
            inside this one and the two sets of gutters added up.
          */}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </main>
      </div>

      {/*
        3. Mobile Bottom Navigation (replaces hamburger drawer on mobile).
        Also in Team, which has no rail of its own: without it a phone user who reached Team had
        only the app-bar menu to leave by. Team shows My Space's modules, none highlighted since
        none of them is the screen on show; choosing one moves to My Space (`navigateToModule`).
      */}
      {(showLeftRail || activeSpace === 'Team') && (
        <EmsMobileBottomNav
          activeModule={activeSpace === 'Team' ? '' : activeModule}
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

      {/* Asks for a reason after a check-in on an approved optional holiday, from any screen. */}
      <HolidayCheckInPrompt />

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
