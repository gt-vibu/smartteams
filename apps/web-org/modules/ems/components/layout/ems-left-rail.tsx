'use client';

import React from 'react';
import { useAuth } from '../../hooks/use-auth';
import { adminNavItems } from './navigation-admin-items';
import { employeeNavItems } from './navigation-employee-items';

interface EmsLeftRailProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace?: string;
}

export function EmsLeftRail({
  activeModule,
  onSelectModule,
  activeSpace = 'My Space',
}: EmsLeftRailProps) {
  const { canAccessModule } = useAuth();
  const isOrgSpace = activeSpace === 'Organization';

  // Employee workspace items

  const candidateItems = isOrgSpace ? adminNavItems : employeeNavItems;
  const visibleItems = candidateItems.filter((item) => canAccessModule(item.id));

  return (
    <aside className="w-[76px] h-full bg-sidebar dark:bg-background text-sidebar-foreground flex flex-col justify-between py-2.5 shrink-0 z-20 border-r border-sidebar-border dark:border-border select-none">
      <div className="space-y-1.5 overflow-y-auto no-scrollbar px-1.5">
        {visibleItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex flex-col items-center justify-center py-2 px-1 rounded-[8px] transition-all relative cursor-pointer group ${
                isActive
                  ? 'bg-sidebar-accent/30 text-white font-bold ring-1 ring-sidebar-accent/40'
                  : 'hover:bg-sidebar-accent/15 text-sidebar-foreground/85 hover:text-white'
              }`}
            >
              <div
                className={`mb-1 transition-transform group-hover:scale-105 ${isActive ? 'text-white' : 'text-sidebar-foreground/80 group-hover:text-white'}`}
              >
                {item.icon('h-4 w-4')}
              </div>
              <span
                className={`text-[9.5px] leading-tight font-medium text-center px-0.5 break-normal tracking-tight max-w-[66px] ${isActive ? 'text-white font-bold' : 'text-sidebar-foreground/80 group-hover:text-white'}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Rail Controls */}
      <div className="flex flex-col items-center space-y-2 pb-2 text-sidebar-foreground/80">
        <button
          type="button"
          onClick={() => onSelectModule('files')}
          className="p-1.5 hover:text-white hover:bg-sidebar-accent/20 dark:hover:bg-sidebar-accent/20 rounded transition-colors cursor-pointer"
          title="Files & Documents"
          aria-label="Files and documents"
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
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}
