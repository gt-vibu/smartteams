'use client';

import { Button, Input } from '@smarteam/ui';
import React, { useState, useEffect, useRef } from 'react';
import { employeeDisplayName } from '@smarteam/contracts';
import { useAuth } from '../../hooks/use-auth';
import { useEmployees, useProjects } from '../../hooks/use-workforce';
import { useAttendance } from '../../hooks/use-attendance';
import { COMMAND_MODULE_BY_ID, buildCommandItems } from './command-palette-items';
import type { CommandItem } from './command-palette-types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateModule: (module: string) => void;
  onNavigateSpace: (space: string) => void;
  onSelectEmployee?: (employeeId: string) => void;
  onSelectProject?: (projectId: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigateModule,
  onNavigateSpace,
  onSelectEmployee,
  onSelectProject,
}: CommandPaletteProps) {
  const { workspaceContext, isAssignedToAnyTeam, canAccessModule } = useAuth();
  const { data: employeeList } = useEmployees();
  const employees = employeeList ?? [];
  const { data: projectList } = useProjects();
  const { isCheckedIn, checkIn, checkOut } = useAttendance();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          window.dispatchEvent(new CustomEvent('ems:open:command-palette'));
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const allItems = buildCommandItems({
    canAccessModule,
    checkIn,
    checkOut,
    isAssignedToAnyTeam,
    isCheckedIn,
    onClose,
    onNavigateModule,
    onNavigateSpace,
    workspaceContext,
  });

  const people: CommandItem[] = employees.map((employee) => ({
    id: employee.id,
    title: employeeDisplayName(employee),
    subtitle: employee.employeeNumber,
    category: 'People',
    icon: <span className="text-muted-foreground">👤</span>,
    onSelect: () => {
      onSelectEmployee?.(employee.id);
      onClose();
    },
  }));

  const projects: CommandItem[] = (projectList ?? []).map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: [p.code, p.status].filter(Boolean).join(' · '),
    category: 'Projects',
    icon: <span className="text-muted-foreground">📦</span>,
    onSelect: () => {
      onSelectProject?.(p.id);
      if (workspaceContext === 'ADMIN') {
        onNavigateSpace('Organization');
      } else {
        onNavigateSpace('My Space');
        onNavigateModule('projects');
      }
      onClose();
    },
  }));

  const scopedItems = allItems.filter((item) => {
    const module = COMMAND_MODULE_BY_ID[item.id];
    return module ? canAccessModule(module) : false;
  });
  const allSearchable = [
    ...scopedItems,
    ...(canAccessModule('projects') ? projects : []),
    ...people,
  ];

  const filtered = query.trim()
    ? allSearchable.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
        );
      })
    : scopedItems;

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onSelect();
      }
    }
  };

  if (!isOpen) return null;

  // On a phone the palette opens with the keyboard up, so it sits at the top and stops at about
  // half the screen: at 80vh its lower results were behind the keyboard with no way to reach them.
  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-24 px-3 sm:px-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-popover border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[55dvh] sm:max-h-[80vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input Bar */}
        <div className="p-3 border-b border-border bg-card flex items-center gap-2.5">
          <div className="h-5 w-5 flex items-center justify-center text-muted-foreground shrink-0">
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
          </div>
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              workspaceContext === 'ADMIN'
                ? 'Search actions, policies, payroll, staff, or projects (⌘K)...'
                : 'Search actions, timesheets, leaves, staff, or projects (⌘K)...'
            }
            className="w-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-xs text-foreground placeholder:text-muted-foreground h-7"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear command search"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer h-6 px-1.5"
            >
              ✕
            </Button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] font-mono font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Quick Filter Badges Bar. Wraps rather than panning: five chips and a label are wider
            than a phone, and a sideways strip inside a dialog is easy to miss entirely. */}
        <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1 tracking-wider">
            Filter:
          </span>
          {['All', 'Actions', 'Navigation', 'People', 'Projects'].map((cat) => {
            const isCatActive =
              query.toLowerCase() === cat.toLowerCase() || (cat === 'All' && !query);
            return (
              <button
                type="button"
                key={cat}
                onClick={() => setQuery(cat === 'All' ? '' : cat)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isCatActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 no-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              No matching results found for{' '}
              <span className="text-foreground font-semibold">"{query}"</span>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer select-none ${
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60 text-foreground'
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-muted/70 flex items-center justify-center text-xs shrink-0 text-muted-foreground">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      {item.category}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="p-2 border-t border-border bg-card flex items-center justify-between text-[11px] text-muted-foreground px-3">
          <span>
            Context:{' '}
            <span className="font-medium text-foreground">
              {workspaceContext === 'ADMIN' ? 'Admin Workspace' : 'Employee Workspace'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span>Select with</span>
            <kbd className="font-mono text-[10px] bg-muted border border-border px-1.5 py-0.5 rounded text-foreground">
              ↵ Enter
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
