'use client';

import React from 'react';
import { Brand } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import { PersonaSwitcher } from './persona-switcher';
import { WorkspaceMenu } from './workspace-menu';

interface EmsTopAppBarProps {
  activeSpace: string;
  onSelectSpace: (space: string) => void;
  onOpenSearch?: () => void;
  onOpenNotifications?: () => void;
  hasUnreadNotifications?: boolean;
}

/**
 * The app bar: an app header on a phone, a toolbar on a laptop.
 *
 * On a phone it is 52px tall with 40px targets and 20px icons; from `md` it returns to the dense
 * 48px desktop bar. The top inset is padded because `viewport-fit=cover` lets the page draw under
 * the status bar, which is what lets the bar's colour run to the top edge of the screen.
 */
export function EmsTopAppBar({
  activeSpace,
  onSelectSpace,
  onOpenSearch,
  onOpenNotifications,
  hasUnreadNotifications = false,
}: EmsTopAppBarProps) {
  const { workspaceContext, visibleSpaces } = useAuth();
  const spaces = visibleSpaces.map((space) => space.id);

  return (
    <header className="sticky top-0 z-40 w-full shrink-0 border-b border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground shadow-xs">
      <div className="flex h-13 items-center justify-between gap-2 px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:h-12 md:px-4">
        <div className="flex min-w-0 items-center gap-2 md:gap-3.5">
          <button
            type="button"
            aria-label="Smarteam home"
            title="Go to overview"
            onClick={() => onSelectSpace(activeSpace)}
            className="shrink-0 rounded-md text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Brand
              compact
              className="shrink-0 text-white [&>span:first-child]:size-7 [&>span:first-child]:rounded-[6px] [&>span:first-child>svg]:size-4"
            />
          </button>

          <WorkspaceMenu activeSpace={activeSpace} onSelectSpace={onSelectSpace} />

          {spaces.length > 1 && (
            <nav
              aria-label="Spaces"
              className="hidden shrink-0 items-center gap-1 border-l border-slate-700/60 pl-2 md:flex"
            >
              {spaces.map((space) => {
                const isActive = activeSpace === space;
                return (
                  <button
                    type="button"
                    key={space}
                    onClick={() => onSelectSpace(space)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`whitespace-nowrap rounded-[5px] px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-card/15 font-bold text-white shadow-xs'
                        : 'text-sidebar-foreground/80 hover:bg-card/10 hover:text-white'
                    }`}
                  >
                    {space}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search employees, teams, projects, or anything"
          className="mx-5 hidden h-9 min-w-0 max-w-[560px] flex-1 items-center gap-2.5 rounded-md border border-white/15 bg-white/[0.07] px-3 text-left text-xs text-sidebar-foreground/75 transition-colors hover:border-white/25 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 lg:flex"
        >
          <svg
            aria-hidden="true"
            className="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <span className="min-w-0 flex-1 truncate">
            Search employees, teams, projects, or anything…
          </span>
          <kbd className="shrink-0 rounded border border-white/15 bg-black/15 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/70">
            Ctrl K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 text-sidebar-foreground/85 md:gap-1.5">
          {workspaceContext === 'ADMIN' && (
            <AppBarButton
              label="Quick action"
              onClick={() => window.dispatchEvent(new CustomEvent('ems:open:command-palette'))}
              className="hidden border border-white/20 bg-card/10 text-white hover:bg-card/20 sm:flex"
              icon="M12 4v16m8-8H4"
            />
          )}

          <AppBarButton
            label="Search"
            title="Open command & search (⌘K / Ctrl+K)"
            onClick={onOpenSearch}
            className="lg:hidden"
            icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          >
            <span className="hidden rounded border border-sidebar-border bg-black/20 px-1.5 py-0.5 font-mono text-[10px] lg:inline">
              ⌘K
            </span>
          </AppBarButton>

          <AppBarButton
            label={hasUnreadNotifications ? 'Notifications, some unread' : 'Notifications'}
            onClick={onOpenNotifications}
            className="relative"
            icon="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          >
            {hasUnreadNotifications && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-sidebar md:right-1.5 md:top-1.5" />
            )}
          </AppBarButton>

          <PersonaSwitcher />
        </div>
      </div>
    </header>
  );
}

/**
 * One app-bar control: a 40px target with a 20px glyph on a phone, 32px and 16px from `md`.
 *
 * A plain `button` for the same reason as the bottom bar's tabs: the shared `Button` forces every
 * descendant `svg` to 14px through `[&_svg]:size-3.5`, which out-specifies the icon's own size.
 */
function AppBarButton({
  label,
  title,
  icon,
  onClick,
  className = '',
  children,
}: {
  label: string;
  title?: string;
  icon: string;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2 transition-colors hover:bg-card/10 hover:text-white cursor-pointer md:h-8 md:min-w-8 md:px-1.5 ${className}`}
    >
      <svg
        className="h-5 w-5 shrink-0 md:h-4 md:w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {children}
    </button>
  );
}
