'use client';

import { Button, Input } from '@smarteam/ui';

import React, { useState, useEffect, useRef } from 'react';
import { employeeDisplayName } from '@smarteam/contracts';
import { useAuth } from '../../hooks/use-auth';
import { useEmployees, useProjects } from '../../hooks/use-workforce';
import { useAttendance } from '../../hooks/use-attendance';
import { buildCommandItems } from './command-palette-items';
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

  // People come from the employees API. There is deliberately no fixture fallback: when the
  // directory cannot be read the People section is simply empty rather than showing invented
  // colleagues.
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

  // Add Projects Search Items
  // Projects come from the API. Without permission the section is empty rather than listing
  // projects that do not exist in this tenant.
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

  const moduleByNavigationId: Record<string, string> = {
    'nav-home': 'home',
    'nav-attendance': 'attendance',
    'nav-time-off': 'time-off',
    'nav-timesheet': 'timesheet',
    'nav-projects': 'projects',
    'nav-payroll': 'payroll',
  };
  const scopedItems = allItems.filter((item) => {
    if (item.id === 'act-admin-payroll') return canAccessModule('payroll');
    const module = moduleByNavigationId[item.id];
    return !module || canAccessModule(module);
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 px-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-[10px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input Bar with Glowing Accent */}
        <div className="p-3.5 border-b border-border bg-muted/40/80 flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-sky-100 border border-sky-300 flex items-center justify-center text-primary shrink-0">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
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
                ? 'Search admin actions, policies, payroll, or staff (⌘K)...'
                : 'Search personal actions, timesheets, leaves, or staff (⌘K)...'
            }
            className="w-full bg-transparent text-sm text-foreground placeholder-slate-400 focus:outline-none font-medium"
          />
          {query && (
            <Button
              type="button"
              aria-label="Clear command search"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer px-1"
            >
              ✕
            </Button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Quick Filter Badges Bar */}
        <div className="px-3.5 py-2 border-b border-border bg-muted/40/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mr-1">
            Filter:
          </span>
          {['All', 'Actions', 'Navigation', 'People', 'Projects'].map((cat) => {
            const isCatActive =
              query.toLowerCase() === cat.toLowerCase() || (cat === 'All' && !query);
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                key={cat}
                onClick={() => setQuery(cat === 'All' ? '' : cat)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap border ${
                  isCatActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                }`}
              >
                {cat}
              </Button>
            );
          })}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              No matching results found for{' '}
              <span className="text-foreground font-semibold">"{query}"</span>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const getCategoryStyle = (cat: string) => {
                switch (cat) {
                  case 'Actions':
                    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
                  case 'Navigation':
                    return 'text-sky-700 bg-sky-50 border-sky-200';
                  case 'People':
                    return 'text-purple-700 bg-purple-50 border-purple-200';
                  case 'Projects':
                    return 'text-amber-700 bg-amber-50 border-amber-200';
                  default:
                    return 'text-muted-foreground bg-muted border-border';
                }
              };

              return (
                <Button
                  type="button"
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left p-2.5 rounded-[6px] transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 text-foreground shadow-2xs border border-sky-300 ring-1 ring-sky-200'
                      : 'hover:bg-muted/40 text-foreground border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-[5px] bg-muted flex items-center justify-center text-sm shrink-0 border border-border text-muted-foreground shadow-2xs">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                        {item.badge}
                      </span>
                    )}
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getCategoryStyle(item.category)}`}
                    >
                      {item.category}
                    </span>
                  </div>
                </Button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="p-2 border-t border-border bg-muted/40 flex items-center justify-between text-[10px] text-muted-foreground px-3">
          <span>
            Context:{' '}
            <span className="font-semibold text-foreground">
              {workspaceContext === 'ADMIN' ? 'Admin Workspace' : 'Employee Workspace'}
            </span>
          </span>
          <span>
            Select with{' '}
            <kbd className="font-mono bg-card border border-border px-1 rounded shadow-2xs">
              ↵ Enter
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
