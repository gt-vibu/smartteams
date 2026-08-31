'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import { Brand } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import { PersonaSwitcher } from './persona-switcher';
import { useTheme } from '../../hooks/use-theme';

interface EmsTopAppBarProps {
  activeSpace: string;
  onSelectSpace: (space: string) => void;
  onOpenSearch?: () => void;
  onOpenNotifications?: () => void;
}

export function EmsTopAppBar({
  activeSpace,
  onSelectSpace,
  onOpenSearch,
  onOpenNotifications,
}: EmsTopAppBarProps) {
  const { workspaceContext, canSwitchWorkspace, switchWorkspace, visibleSpaces } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  // Compute visible top navigation spaces (strictly My Space, Team, Organization based on context and role)
  const spaces = visibleSpaces.map((s) => s.id);

  const handleToggleWorkspace = (target: 'ADMIN' | 'EMPLOYEE') => {
    setIsWorkspaceMenuOpen(false);
    switchWorkspace(target);
    if (target === 'ADMIN') {
      onSelectSpace('Organization');
    } else {
      onSelectSpace('My Space');
    }
  };

  return (
    <>
      <header className="h-10 sm:h-12 w-full bg-sidebar border-b border-sidebar-border px-2.5 sm:px-4 flex items-center justify-between z-40 sticky top-0 shrink-0 shadow-xs text-sidebar-foreground">
        {/* Left: Brand + Workspace Switcher + Desktop Space Selector */}
        <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
          {/* Brand Logo */}
          <Brand
            compact
            className="shrink-0 text-white [&>span:first-child]:size-7 [&>span:first-child]:rounded-[6px] [&>span:first-child>svg]:size-4"
          />

          {/* Operating Context Switcher */}
          {canSwitchWorkspace && (
            <div className="relative">
              <Button
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-sidebar/80 hover:bg-sidebar-accent/20 text-primary border border-sidebar-border rounded text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer max-w-[140px] sm:max-w-none truncate"
                title="Switch Operating Workspace"
                aria-haspopup="true"
                aria-expanded={isWorkspaceMenuOpen}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
                <span className="truncate">
                  {workspaceContext === 'ADMIN' ? 'Admin' : 'Employee'}
                </span>
                <svg
                  className="h-3 w-3 text-slate-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </Button>

              {isWorkspaceMenuOpen && (
                <>
                  <div
                    onClick={() => setIsWorkspaceMenuOpen(false)}
                    className="fixed inset-0 z-40"
                  />
                  <div className="absolute left-0 mt-1.5 w-52 bg-sidebar border border-sidebar-border rounded-md shadow-xl z-50 py-1 text-xs text-sidebar-foreground">
                    <div className="px-3 py-1.5 border-b border-sidebar-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Operating Context
                    </div>
                    <Button
                      onClick={() => handleToggleWorkspace('ADMIN')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-sidebar-accent/20 cursor-pointer ${
                        workspaceContext === 'ADMIN'
                          ? 'text-primary font-bold bg-sidebar-accent/20'
                          : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>🏢</span>
                        <span>Admin Workspace</span>
                      </div>
                      {workspaceContext === 'ADMIN' && <span className="text-sky-400">✓</span>}
                    </Button>
                    <Button
                      onClick={() => handleToggleWorkspace('EMPLOYEE')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-sidebar-accent/20 cursor-pointer ${
                        workspaceContext === 'EMPLOYEE'
                          ? 'text-primary font-bold bg-sidebar-accent/20'
                          : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>👤</span>
                        <span>Employee Workspace</span>
                      </div>
                      {workspaceContext === 'EMPLOYEE' && <span className="text-sky-400">✓</span>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Primary Computed Space Selector (Desktop & Tablet) */}
          {spaces.length > 1 && (
            <div className="hidden md:flex items-center space-x-1 pl-2 border-l border-slate-700/60 shrink-0">
              {spaces.map((space) => {
                const isActive = activeSpace === space;
                return (
                  <Button
                    key={space}
                    onClick={() => onSelectSpace(space)}
                    className={`px-3 py-1 text-xs font-semibold rounded-[5px] transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-sidebar-accent/20 text-white border border-primary/30 shadow-xs'
                        : 'text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/20'
                    }`}
                  >
                    {space}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Quick Action, Global Search, Notification Bell, Theme Switcher, User Avatar */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 text-slate-300 shrink-0">
          {/* Quick Create + Action (Strictly for ADMIN context) */}
          {workspaceContext === 'ADMIN' && (
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('ems:open:command-palette'))}
              className="hidden sm:flex h-9 w-9 rounded-[5px] bg-primary hover:bg-primary/90 text-primary-foreground items-center justify-center transition-colors shadow-xs cursor-pointer"
              title="Quick Action"
              aria-label="Quick Action"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          )}

          {/* Search Icon with Keyboard Hint */}
          <Button
            onClick={onOpenSearch}
            className="flex items-center gap-1.5 p-1.5 text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/20 rounded transition-colors cursor-pointer"
            title="Open Command & Search (⌘K / Ctrl+K)"
            aria-label="Search"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="hidden lg:inline text-[10px] font-mono text-slate-300 bg-[#0E2038] px-1.5 py-0.5 rounded border border-slate-700/60">
              ⌘K
            </span>
          </Button>

          {/* Notification Bell */}
          <Button
            onClick={onOpenNotifications}
            className="p-1.5 text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/20 rounded transition-colors cursor-pointer relative"
            title="Notifications"
            aria-label="Notifications"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
          </Button>

          {/* Dark / Light Mode Switcher */}
          <Button
            onClick={toggleTheme}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-[5px] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
              isDark
                ? 'bg-[#1E2530] text-amber-400 border-amber-400/30 hover:bg-[#283242]'
                : 'bg-[#112340] text-sky-300 border-sky-400/30 hover:bg-[#183058]'
            }`}
            title={
              isDark
                ? 'Current: Dark Mode (Click to switch to Light Mode)'
                : 'Current: Light Mode (Click to switch to Dark Mode)'
            }
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <>
                <svg
                  className="h-3.5 w-3.5 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
                <span className="hidden sm:inline text-[11px] font-bold text-amber-300">Dark</span>
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5 text-sky-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <span className="hidden sm:inline text-[11px] font-bold text-sky-200">Light</span>
              </>
            )}
          </Button>

          {/* Persona Switcher & Current User Identity */}
          <PersonaSwitcher />
        </div>
      </header>
    </>
  );
}
