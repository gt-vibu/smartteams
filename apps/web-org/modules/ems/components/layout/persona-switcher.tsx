'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/use-auth';

export function PersonaSwitcher() {
  const { persona, logout, workspaceContext } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean role label for top bar
  const displayedRoleLabel =
    workspaceContext === 'ADMIN' ? 'Tenant Admin' : persona.jobTitle || 'Employee';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Pill Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-[5px] bg-[#112340] hover:bg-[#182E52] text-white border border-[#1E3860] transition-all cursor-pointer shadow-xs group"
        title="Account"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className="h-5 w-5 rounded-full bg-[#0284C7] text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
          {persona.avatarInitials}
        </div>
        <div className="text-left hidden lg:block">
          <div className="text-[11px] font-bold text-white leading-none">{persona.name}</div>
          <div className="text-[9px] font-semibold text-sky-300 leading-none mt-0.5">
            {displayedRoleLabel}
          </div>
        </div>
        <svg
          className={`h-3 w-3 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-[10px] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Profile Header */}
          <div className="p-4 bg-slate-50 flex items-center gap-3 border-b border-slate-100">
            <div className="h-10 w-10 rounded-full bg-[#0284C7] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
              {persona.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{persona.name}</div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">{persona.email}</div>
              <div className="text-[9px] text-sky-700 font-semibold mt-0.5">
                {displayedRoleLabel}
              </div>
            </div>
          </div>

          {/* Account Details */}
          <div className="p-2 space-y-0.5">
            <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-slate-600">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <span className="truncate">{persona.department}</span>
            </div>
            <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-slate-600">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="truncate">{persona.branchName}</span>
            </div>
            <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-slate-600">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                />
              </svg>
              <span className="truncate font-mono text-slate-500">{persona.employeeNumber}</span>
            </div>
          </div>

          {/* Context Badge */}
          <div className="px-3 pb-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-1 rounded border uppercase tracking-wider ${
                workspaceContext === 'ADMIN'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${workspaceContext === 'ADMIN' ? 'bg-violet-600' : 'bg-sky-600'} animate-pulse`}
              />
              {workspaceContext === 'ADMIN' ? 'Admin Workspace' : 'Employee Workspace'}
            </span>
          </div>

          {/* Sign Out */}
          <div className="border-t border-slate-100 p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
