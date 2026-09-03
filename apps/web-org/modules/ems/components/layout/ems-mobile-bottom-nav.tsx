'use client';

import { Button } from '@smarteam/ui';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { adminNavItems } from './navigation-admin-items';
import { employeeNavItems } from './navigation-employee-items';

interface EmsMobileBottomNavProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace: string;
}

export function EmsMobileBottomNav({
  activeModule,
  onSelectModule,
  activeSpace,
}: EmsMobileBottomNavProps) {
  const { canAccessModule } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close "More" panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreOpen]);

  const isOrgSpace = activeSpace === 'Organization';

  const candidateItems = isOrgSpace ? adminNavItems : employeeNavItems;
  const allItems = isMounted
    ? candidateItems.filter((item) => (isOrgSpace ? true : canAccessModule(item.id)))
    : candidateItems;

  // Show 4 primary items + the "More" button
  const PRIMARY_COUNT = 4;
  const primaryItems = allItems.slice(0, PRIMARY_COUNT);
  const overflowItems = allItems.slice(PRIMARY_COUNT);
  const hasOverflow = overflowItems.length > 0;

  // Is any overflow item currently active?
  const isOverflowActive = overflowItems.some((item) => item.id === activeModule);

  const handleSelect = (id: string) => {
    onSelectModule(id);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* More panel backdrop */}
      {isMoreOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={() => setIsMoreOpen(false)}
        />
      )}

      {/* More panel popover — slides up from bottom nav */}
      {isMoreOpen && (
        <div
          ref={moreRef}
          className="fixed bottom-[57px] left-0 right-0 z-50 md:hidden bg-white dark:bg-card border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl px-4 pt-4 pb-3 animate-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              More
            </span>
            <Button
              onClick={() => setIsMoreOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {overflowItems.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => handleSelect(item.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className={isActive ? 'text-slate-900 dark:text-white' : ''}>
                    {item.icon('h-5 w-5')}
                  </div>
                  <span className="text-[10px] font-semibold text-center leading-tight break-words max-w-[56px]">
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Nav Bar — only visible on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-card border-t border-slate-200 dark:border-slate-800 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.3)] flex items-stretch">
        {primaryItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => handleSelect(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 transition-all cursor-pointer relative rounded-none ${
                isActive
                  ? 'text-slate-900 dark:text-white font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute top-0 left-3 right-3 h-[2px] bg-slate-900 dark:bg-white rounded-full" />
              )}
              <div className={isActive ? 'text-slate-900 dark:text-white' : ''}>
                {item.icon('h-5 w-5')}
              </div>
              <span className="text-[10px] font-semibold leading-tight truncate max-w-[56px] text-center">
                {item.label}
              </span>
            </Button>
          );
        })}

        {/* More Button */}
        {hasOverflow && (
          <Button
            variant="ghost"
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 transition-all cursor-pointer relative rounded-none ${
              isOverflowActive || isMoreOpen
                ? 'text-slate-900 dark:text-white font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {(isOverflowActive || isMoreOpen) && (
              <span className="absolute top-0 left-3 right-3 h-[2px] bg-slate-900 dark:bg-white rounded-full" />
            )}
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
              />
            </svg>
            <span className="text-[10px] font-semibold leading-tight">More</span>
          </Button>
        )}
      </nav>
    </>
  );
}
