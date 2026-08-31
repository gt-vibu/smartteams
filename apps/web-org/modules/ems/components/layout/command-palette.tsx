'use client';

import { Button, Input } from '@smarteam/ui';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { useAttendance } from '../../hooks/use-attendance';
import projectsFixture from '../../data/fixtures/projects.json';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateModule: (module: string) => void;
  onNavigateSpace: (space: string) => void;
  onSelectEmployee?: (employeeId: string) => void;
  onSelectProject?: (projectId: string) => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions' | 'People' | 'Projects';
  icon: React.ReactNode;
  badge?: string;
  onSelect: () => void;
}

interface ProjectSearchRecord {
  id: string;
  name: string;
  code: string;
  branchName: string;
  status: string;
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
  const { liveState, checkIn, checkOut } = useAttendance();
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

  // Build command items filtered by active operating workspace context and permissions
  const allItems: CommandItem[] = [];

  if (workspaceContext === 'ADMIN') {
    // ── Admin Actions ────────────────────────────────────────────────────────
    allItems.push(
      {
        id: 'act-admin-payroll',
        title: 'Start New Payroll Run',
        subtitle: 'Initiate monthly compensation run and calculation',
        category: 'Actions',
        badge: 'Admin',
        icon: <span className="text-sky-400">💳</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'act-admin-leave-policy',
        title: 'Create Leave Policy',
        subtitle: 'Configure annual allowance, accrual frequency & branch rules',
        category: 'Actions',
        badge: 'Admin',
        icon: <span className="text-purple-400">🌴</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'act-admin-attendance-roster',
        title: 'Inspect Attendance Daily Roster',
        subtitle: 'Filter organizational daily presence and punch logs',
        category: 'Actions',
        badge: 'Admin',
        icon: <span className="text-emerald-400">⏱️</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      // ── Admin Navigation ──────────────────────────────────────────────────
      {
        id: 'nav-admin-org',
        title: 'Go to Organization Hub',
        subtitle: 'Department directory, hierarchy & branches',
        category: 'Navigation',
        icon: <span className="text-slate-400">🏢</span>,
        onSelect: () => {
          onNavigateSpace('Organization');
          onClose();
        },
      },
      {
        id: 'nav-admin-team',
        title: 'Go to Team Workspace',
        subtitle: 'View team squads and structure',
        category: 'Navigation',
        icon: <span className="text-slate-400">👥</span>,
        onSelect: () => {
          onNavigateSpace('Team');
          onClose();
        },
      },
    );
  } else {
    // ── Employee Actions ────────────────────────────────────────────────────
    allItems.push(
      {
        id: 'act-punch',
        title: liveState.isCheckedIn ? 'Check Out of Attendance' : 'Check In to Attendance',
        subtitle: liveState.isCheckedIn ? 'Stop active session timer' : 'Start attendance timer',
        category: 'Actions',
        badge: 'Action',
        icon: (
          <svg
            className="h-4 w-4 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
        onSelect: () => {
          if (liveState.isCheckedIn) checkOut('Checked out via Command Bar');
          else checkIn('Checked in via Command Bar');
          onClose();
        },
      },
      {
        id: 'act-logtime',
        title: 'Log Work Time to Project',
        subtitle: 'Record time entry on active timesheet',
        category: 'Actions',
        badge: 'Action',
        icon: (
          <svg
            className="h-4 w-4 text-sky-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        ),
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('timesheet');
          onClose();
        },
      },
      {
        id: 'act-leave',
        title: 'Apply for Leave / Time Off',
        subtitle: 'Submit casual or sick leave request',
        category: 'Actions',
        badge: 'Action',
        icon: (
          <svg
            className="h-4 w-4 text-purple-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ),
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('time-off');
          onClose();
        },
      },
      // ── Employee Navigation (Side Navbar Modules) ─────────────────────────
      {
        id: 'nav-home',
        title: 'Overview (Home)',
        subtitle: 'Personal dashboard, presence, and schedule',
        category: 'Navigation',
        icon: <span className="text-slate-400">🏠</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('home');
          onClose();
        },
      },
      {
        id: 'nav-attendance',
        title: 'Attendance (Side Nav)',
        subtitle: 'Daily check-in timeline and attendance calendar',
        category: 'Navigation',
        icon: <span className="text-slate-400">⏱️</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('attendance');
          onClose();
        },
      },
      {
        id: 'nav-time-off',
        title: 'Time Off / Leave (Side Nav)',
        subtitle: 'Personal leave balances & applications',
        category: 'Navigation',
        icon: <span className="text-slate-400">🌴</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('time-off');
          onClose();
        },
      },
      {
        id: 'nav-timesheet',
        title: 'Timesheet Tracker (Side Nav)',
        subtitle: 'Weekly timesheet logs and timers',
        category: 'Navigation',
        icon: <span className="text-slate-400">📅</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('timesheet');
          onClose();
        },
      },
      {
        id: 'nav-projects',
        title: 'Projects (Side Nav)',
        subtitle: 'Assigned project delivery squads',
        category: 'Navigation',
        icon: <span className="text-slate-400">📂</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('projects');
          onClose();
        },
      },
      {
        id: 'nav-payroll',
        title: 'Payroll / Payslips (Side Nav)',
        subtitle: 'Salary structure and payslip history',
        category: 'Navigation',
        icon: <span className="text-slate-400">💳</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('payroll');
          onClose();
        },
      },
    );

    if (canAccessModule('approvals')) {
      allItems.push({
        id: 'nav-approvals',
        title: 'Approvals Center (Side Nav)',
        subtitle: 'Sign-off pending team leave and timesheet requests',
        category: 'Navigation',
        badge: 'Manager',
        icon: <span className="text-slate-400">✅</span>,
        onSelect: () => {
          onNavigateSpace('My Space');
          onNavigateModule('approvals');
          onClose();
        },
      });
    }

    if (isAssignedToAnyTeam) {
      allItems.push({
        id: 'nav-team',
        title: 'Team Space (Top Nav)',
        subtitle: 'View assigned squad roster and team topology',
        category: 'Navigation',
        icon: <span className="text-slate-400">👥</span>,
        onSelect: () => {
          onNavigateSpace('Team');
          onClose();
        },
      });
    }
  }

  // Add People Directory Search Items
  const people: CommandItem[] = [
    {
      id: 'emp-064',
      title: 'Mithun Gowda H',
      subtitle: 'Software Engineer · Engineering & Technology',
      category: 'People',
      icon: <span className="text-slate-400">👤</span>,
      onSelect: () => {
        onSelectEmployee?.('emp_064');
        onClose();
      },
    },
    {
      id: 'emp-009',
      title: 'Ranjith Kumar C',
      subtitle: 'Engineering Manager · Engineering & Technology',
      category: 'People',
      icon: <span className="text-slate-400">👤</span>,
      onSelect: () => {
        onSelectEmployee?.('emp_009');
        onClose();
      },
    },
    {
      id: 'emp-032',
      title: 'Swati Pande',
      subtitle: 'Growth Analyst · Marketing & Growth',
      category: 'People',
      icon: <span className="text-slate-400">👤</span>,
      onSelect: () => {
        onSelectEmployee?.('emp-032');
        onClose();
      },
    },
    {
      id: 'emp-020',
      title: 'Kavita Joshi',
      subtitle: 'Head of Product · Product & UX Design (Mumbai)',
      category: 'People',
      icon: <span className="text-slate-400">👤</span>,
      onSelect: () => {
        onSelectEmployee?.('emp-020');
        onClose();
      },
    },
    {
      id: 'emp-040',
      title: 'Vikramaditya Sengupta',
      subtitle: 'VP of People Operations · People & Operations',
      category: 'People',
      icon: <span className="text-slate-400">👤</span>,
      onSelect: () => {
        onSelectEmployee?.('emp-040');
        onClose();
      },
    },
  ];

  // Add Projects Search Items
  const projects: CommandItem[] = (projectsFixture.projects as ProjectSearchRecord[]).map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: `${p.code} · ${p.branchName} · ${p.status}`,
    category: 'Projects',
    icon: <span className="text-slate-400">📦</span>,
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
        className="w-full max-w-xl bg-white border border-slate-200 rounded-[10px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input Bar with Glowing Accent */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center gap-3">
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
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none font-medium"
          />
          {query && (
            <Button
              type="button"
              aria-label="Clear command search"
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer px-1"
            >
              ✕
            </Button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Quick Filter Badges Bar */}
        <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1">
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
                    : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
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
            <div className="p-8 text-center text-slate-400 text-xs">
              No matching results found for{' '}
              <span className="text-slate-700 font-semibold">"{query}"</span>
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
                    return 'text-slate-600 bg-slate-100 border-slate-200';
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
                      ? 'bg-sky-50 text-slate-900 shadow-2xs border border-sky-300 ring-1 ring-sky-200'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-[5px] bg-slate-100 flex items-center justify-center text-sm shrink-0 border border-slate-200 text-slate-600 shadow-2xs">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
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
        <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500 px-3">
          <span>
            Context:{' '}
            <span className="font-semibold text-slate-700">
              {workspaceContext === 'ADMIN' ? 'Admin Workspace' : 'Employee Workspace'}
            </span>
          </span>
          <span>
            Select with{' '}
            <kbd className="font-mono bg-white border border-slate-200 px-1 rounded shadow-2xs">
              ↵ Enter
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
