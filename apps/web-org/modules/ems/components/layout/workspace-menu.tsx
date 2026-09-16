'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { navIcons } from './navigation-icons';

interface WorkspaceMenuProps {
  activeSpace: string;
  onSelectSpace: (space: string) => void;
}

/**
 * Where the person is: which workspace they are operating in, and — on a phone — which space.
 *
 * On a laptop the spaces are tabs in the app bar and this only switches workspace. On a phone
 * those tabs are hidden for room, and nothing else offered them: a manager in the Employee
 * workspace has My Space *and* Team, and the bottom bar only exists in My Space and Organization,
 * so Team could not be reached from a phone at all. The spaces are listed here below `md`, which
 * is the one control a phone user already has for "take me somewhere else".
 *
 * Plain buttons rather than the shared `Button`: its base `whitespace-nowrap` and `inline-flex`
 * stopped the label from ever truncating, so at ~540px the chevron ran into the search icon.
 */
export function WorkspaceMenu({ activeSpace, onSelectSpace }: WorkspaceMenuProps) {
  const { workspaceContext, canSwitchWorkspace, switchWorkspace, visibleSpaces } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const spaces = visibleSpaces.map((space) => space.id);
  const hasSpaceChoice = spaces.length > 1;
  if (!canSwitchWorkspace && !hasSpaceChoice) return null;

  const workspaceLabel = workspaceContext === 'ADMIN' ? 'Admin' : 'Employee';

  const chooseWorkspace = (target: 'ADMIN' | 'EMPLOYEE') => {
    setIsOpen(false);
    switchWorkspace(target);
    onSelectSpace(target === 'ADMIN' ? 'Organization' : 'My Space');
  };
  const chooseSpace = (space: string) => {
    setIsOpen(false);
    onSelectSpace(space);
  };

  return (
    // Without a workspace to switch, the only thing in here is the space list, which the desktop
    // tabs already show — so the whole control steps aside at `md`.
    <div ref={rootRef} className={`relative min-w-0 ${canSwitchWorkspace ? '' : 'md:hidden'}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Switch workspace"
        className="flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-card/5 px-2.5 text-xs font-semibold text-sidebar-foreground transition-colors hover:bg-card/10 cursor-pointer md:h-7"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
        {/* A phone shows the space, because that is what changes the screen; a laptop shows the
            workspace, because the space is already a tab beside it. */}
        <span className="min-w-0 truncate md:hidden">
          {hasSpaceChoice ? activeSpace : workspaceLabel}
        </span>
        <span className="hidden min-w-0 truncate md:inline">{workspaceLabel}</span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-1.5 w-56 max-w-[calc(100vw-1.5rem)] rounded-lg border border-sidebar-border bg-sidebar py-1 text-sm text-sidebar-foreground shadow-xl md:text-xs"
        >
          {hasSpaceChoice && (
            <div className="md:hidden">
              <MenuHeading>Section</MenuHeading>
              {spaces.map((space) => (
                <MenuItem
                  key={space}
                  label={space}
                  icon={space === 'Organization' ? navIcons.building : navIcons.home}
                  isCurrent={space === activeSpace}
                  onSelect={() => chooseSpace(space)}
                />
              ))}
            </div>
          )}
          {canSwitchWorkspace && (
            <div className={hasSpaceChoice ? 'border-t border-sidebar-border md:border-t-0' : ''}>
              <MenuHeading>Operating context</MenuHeading>
              <MenuItem
                label="Admin workspace"
                icon={navIcons.building}
                isCurrent={workspaceContext === 'ADMIN'}
                onSelect={() => chooseWorkspace('ADMIN')}
              />
              <MenuItem
                label="Employee workspace"
                icon={navIcons.home}
                isCurrent={workspaceContext === 'EMPLOYEE'}
                onSelect={() => chooseWorkspace('EMPLOYEE')}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/70">
      {children}
    </div>
  );
}

function MenuItem({
  label,
  icon,
  isCurrent,
  onSelect,
}: {
  label: string;
  icon: (className: string) => React.ReactNode;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={onSelect}
      className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-card/10 cursor-pointer md:min-h-8 ${
        isCurrent ? 'bg-card/10 font-bold text-white' : 'text-sidebar-foreground/85'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon('h-4 w-4 shrink-0')}
        <span className="truncate">{label}</span>
      </span>
      {isCurrent && (
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
