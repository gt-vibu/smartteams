'use client';

import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';
import { adminNavItems } from './navigation-admin-items';
import { employeeNavItems } from './navigation-employee-items';
import { useUnreadByModule } from '../../hooks/use-notifications';
import { UnreadDot } from './unread-dot';
import { useAutoHideScrollbar } from '../../hooks/use-auto-hide-scrollbar';

interface EmsLeftRailProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace?: string;
}

const ADMIN_GROUPS = [
  { label: 'People', ids: ['home', 'employees', 'onboarding', 'org-setup'] },
  {
    label: 'Time & attendance',
    ids: ['time-off', 'attendance', 'shifts', 'holidays', 'timesheet'],
  },
  { label: 'Work', ids: ['teams', 'projects'] },
  { label: 'Pay & approvals', ids: ['payroll', 'approvals'] },
  { label: 'Files & reports', ids: ['files', 'reports'] },
] as const;

const EMPLOYEE_GROUPS = [
  { label: 'My work', ids: ['home', 'projects'] },
  { label: 'Time & attendance', ids: ['time-off', 'holidays', 'timesheet', 'attendance'] },
  { label: 'Pay & requests', ids: ['payroll', 'approvals', 'files'] },
] as const;

export function EmsLeftRail({
  activeModule,
  onSelectModule,
  activeSpace = 'My Space',
}: EmsLeftRailProps) {
  const { canAccessModule } = useAuth();
  const unreadByModule = useUnreadByModule();
  const isOrgSpace = activeSpace === 'Organization';
  const candidateItems = isOrgSpace ? adminNavItems : employeeNavItems;
  const visibleItems = candidateItems.filter((item) => canAccessModule(item.id));
  const groups = isOrgSpace ? ADMIN_GROUPS : EMPLOYEE_GROUPS;
  const [expanded, setExpanded] = useState(true);
  const navigationRef = useAutoHideScrollbar<HTMLElement>();

  return (
    <aside
      aria-label="Workspace navigation"
      className={`flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 dark:border-border dark:bg-background ${expanded ? 'w-56' : 'w-[68px]'}`}
    >
      <div
        className={`flex h-12 shrink-0 items-center border-b border-sidebar-border/70 dark:border-border ${expanded ? 'justify-between px-4' : 'justify-center'}`}
      >
        {expanded && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60">
            Workspace
          </span>
        )}
        <button
          type="button"
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
          onClick={() => setExpanded((value) => !value)}
          className="grid size-9 place-items-center rounded-md text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {expanded ? (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>

      <nav
        aria-label={`${activeSpace} modules`}
        ref={navigationRef}
        className="scrollbar-auto-hide min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-3"
      >
        {groups.map((group) => {
          const items = visibleItems.filter((item) =>
            (group.ids as readonly string[]).includes(item.id),
          );
          if (items.length === 0) return null;

          return (
            <section key={group.label} aria-label={group.label}>
              {expanded && (
                <h2 className="mb-2.5 block whitespace-nowrap px-2 text-[10px] font-semibold leading-5 text-sidebar-foreground/55">
                  {group.label}
                </h2>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = activeModule === item.id;
                  const unread = unreadByModule[item.id] ?? 0;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onSelectModule(item.id)}
                      title={expanded ? undefined : item.label}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex h-10 min-h-10 w-full shrink-0 items-center rounded-md px-2.5 text-left leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${expanded ? 'gap-3' : 'justify-center'} ${
                        isActive
                          ? 'bg-sidebar-accent/25 font-semibold text-white ring-1 ring-sidebar-accent/35'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/15 hover:text-white'
                      }`}
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        {item.icon('h-[18px] w-[18px]')}
                      </span>
                      {expanded && (
                        <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                      )}
                      {unread > 0 &&
                        (expanded ? (
                          <span
                            className="min-w-5 rounded-full bg-primary/15 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-primary"
                            aria-label={`${unread} unread`}
                          >
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : (
                          <UnreadDot
                            className="right-2 top-2"
                            ring="ring-sidebar dark:ring-background"
                          />
                        ))}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
