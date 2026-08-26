'use client';

import React from 'react';
import { EmsTopAppBar } from './ems-top-app-bar';
import { EmsLeftRail } from './ems-left-rail';

interface EmsLayoutProps {
  children: React.ReactNode;
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace: string;
  onSelectSpace: (space: string) => void;
}

export function EmsLayout({
  children,
  activeModule,
  onSelectModule,
  activeSpace,
  onSelectSpace,
}: EmsLayoutProps) {
  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'time-off',
      label: 'Time Off',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'timesheet',
      label: 'Timesheet',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'teams',
      label: 'Teams',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="h-screen w-full flex flex-col bg-[#EEF2F6] text-slate-800 antialiased overflow-hidden font-sans">
      {/* 1. Global Top App Bar (Sticky/Fixed at Top) */}
      <EmsTopAppBar
        activeSpace={activeSpace}
        onSelectSpace={onSelectSpace}
      />

      {/* 2. Workspace Body (Desktop Left Rail + Scrollable Content Canvas) */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
        {/* Desktop Left Rail (Hidden on Mobile) */}
        <div className="hidden md:flex shrink-0 h-full">
          <EmsLeftRail
            activeModule={activeModule}
            onSelectModule={onSelectModule}
          />
        </div>

        {/* Dedicated Scrollable Main Content Canvas */}
        <main
          id="ems-main-canvas"
          className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-20 md:pb-6 relative scroll-smooth focus:outline-none"
        >
          {children}
        </main>
      </div>

      {/* 3. Mobile Fixed Bottom Navigation Bar (Hidden on Desktop) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0F172A]/95 border-t border-slate-800 z-50 flex items-center justify-around px-2 shadow-2xl backdrop-blur-md pb-1"
      >
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer relative ${
                isActive
                  ? 'text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1.5 h-1 w-6 bg-sky-400 rounded-full" />
              )}
              <div className="h-5 w-5 flex items-center justify-center mb-0.5">
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

