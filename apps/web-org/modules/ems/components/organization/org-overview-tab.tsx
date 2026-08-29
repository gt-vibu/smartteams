'use client';

import React, { useState } from 'react';
import { Select } from '@smarteam/ui';
import { OrganizationData, BranchData } from '../../types/organization.types';
import { QuickLinkItem } from '../../hooks/use-organization';

interface OrgOverviewTabProps {
  organization: OrganizationData;
  branches: BranchData[];
  quickLinks: QuickLinkItem[];
  onNavigateModule?: (module: string, subView?: any) => void;
  onSelectSubTab?: (tab: string) => void;
  onAddQuickLink?: (link: Omit<QuickLinkItem, 'id'>) => void;
  onRemoveQuickLink?: (id: string) => void;
}

export function OrgOverviewTab({
  organization,
  branches,
  quickLinks,
  onNavigateModule,
  onSelectSubTab,
  onAddQuickLink,
  onRemoveQuickLink,
}: OrgOverviewTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'Services' | 'Location'>('Services');
  const [isAddLinkModalOpen, setIsAddLinkModalOpen] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkModule, setNewLinkModule] = useState('home');

  // Authentic services that exist in the Smarteam platform
  const realServices = [
    {
      id: 'onboarding',
      title: 'Onboarding',
      moduleId: 'onboarding',
      iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      icon: (
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
            d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
          />
        </svg>
      ),
    },
    {
      id: 'time-off',
      title: 'Leave Tracker',
      moduleId: 'time-off',
      iconColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
      icon: (
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
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"
          />
        </svg>
      ),
    },
    {
      id: 'attendance',
      title: 'Attendance',
      moduleId: 'attendance',
      iconColor: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
      icon: (
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      id: 'timesheet',
      title: 'Time Tracker',
      moduleId: 'timesheet',
      iconColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
      icon: (
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      id: 'teams',
      title: 'Teams & Squads',
      moduleId: 'teams',
      iconColor: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
      icon: (
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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
    {
      id: 'projects',
      title: 'Projects & Tasks',
      moduleId: 'projects',
      iconColor: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
      icon: (
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
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
    },
    {
      id: 'payroll',
      title: 'Payroll & Compensation',
      moduleId: 'payroll',
      iconColor: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
      icon: (
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
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
    },
    {
      id: 'approvals',
      title: 'Approvals',
      moduleId: 'approvals',
      iconColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      icon: (
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
            d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
          />
        </svg>
      ),
    },
    {
      id: 'files',
      title: 'Files & Documents',
      moduleId: 'files',
      iconColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
      icon: (
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
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ),
    },
    {
      id: 'directory',
      title: 'Department Directory',
      tabId: 'Department Directory',
      iconColor: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
      icon: (
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
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
    },
    {
      id: 'announcements',
      title: 'Announcements',
      tabId: 'Announcements',
      iconColor: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
      icon: (
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
            d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
          />
        </svg>
      ),
    },
    {
      id: 'calendar',
      title: 'Calendar & Holidays',
      tabId: 'Calendar',
      iconColor: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
      icon: (
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  const handleCreateLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (newLinkTitle.trim()) {
      onAddQuickLink?.({
        title: newLinkTitle.trim(),
        moduleId: newLinkModule,
        iconName: 'link',
      });
      setNewLinkTitle('');
      setIsAddLinkModalOpen(false);
    }
  };

  const handleServiceClick = (svc: (typeof realServices)[0]) => {
    if (svc.moduleId) {
      onNavigateModule?.(svc.moduleId);
    } else if (svc.tabId && onSelectSubTab) {
      onSelectSubTab(svc.tabId);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* ── Left Column: Org Logo Card + Quick Links ── */}
      <div className="lg:col-span-4 xl:col-span-3 space-y-4">
        {/* 1. Organization Logo & Identity Card */}
        <div className="bg-white dark:bg-[#1B2028] rounded-[8px] border border-slate-200/90 dark:border-[#282F3D] p-6 shadow-xs flex flex-col items-center justify-center text-center">
          {/* Zoho-style Interlocking Colorful Cube/Loop Logo */}
          <div className="relative h-20 w-20 flex items-center justify-center mb-3">
            <svg viewBox="0 0 100 100" className="h-16 w-16 drop-shadow-sm">
              <circle cx="50" cy="30" r="12" fill="#0070BA" />
              <path
                d="M50 42 C 40 42 35 48 35 56 L 35 70 C 35 74 39 77 43 77 L 57 77 C 61 77 65 74 65 70 L 65 56 C 65 48 60 42 50 42 Z"
                fill="#0070BA"
              />
              <circle
                cx="28"
                cy="62"
                r="18"
                fill="none"
                stroke="#E53935"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <circle
                cx="72"
                cy="62"
                r="18"
                fill="none"
                stroke="#FB8C00"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <circle
                cx="50"
                cy="28"
                r="18"
                fill="none"
                stroke="#43A047"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
            {organization.name}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {organization.country || 'India'}
          </p>
        </div>

        {/* 2. Quick Links Card */}
        <div className="bg-white dark:bg-[#1B2028] rounded-[8px] border border-slate-200/90 dark:border-[#282F3D] p-4 shadow-xs min-h-[140px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Quick Links</h3>
            <button
              onClick={() => setIsAddLinkModalOpen(true)}
              className="h-5 w-5 rounded border border-[#0284C7] text-[#0284C7] hover:bg-[#0284C7]/10 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              title="Add Quick Link"
            >
              +
            </button>
          </div>

          {quickLinks.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500">
              No quick links
            </div>
          ) : (
            <div className="space-y-1.5 py-2">
              {quickLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 transition-colors group cursor-pointer"
                  onClick={() => link.moduleId && onNavigateModule?.(link.moduleId)}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="text-[#0284C7] font-bold">→</span>
                    <span className="truncate group-hover:text-[#0284C7]">{link.title}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveQuickLink?.(link.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 text-[10px] p-0.5"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Column: Services & Location Sub-tabs ── */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-3 min-w-0">
        {/* Sub-Tabs Selector Header Strip */}
        <div className="border-b border-slate-200 dark:border-[#282F3D] pb-1 flex items-center gap-6">
          <button
            onClick={() => setActiveSubTab('Services')}
            className={`text-xs font-semibold pb-2 transition-colors relative cursor-pointer ${
              activeSubTab === 'Services'
                ? 'text-[#0284C7] dark:text-[#38BDF8] border-b-2 border-[#0284C7] dark:border-[#38BDF8]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Services
          </button>
          <button
            onClick={() => setActiveSubTab('Location')}
            className={`text-xs font-semibold pb-2 transition-colors relative cursor-pointer ${
              activeSubTab === 'Location'
                ? 'text-[#0284C7] dark:text-[#38BDF8] border-b-2 border-[#0284C7] dark:border-[#38BDF8]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Location
          </button>
        </div>

        {/* 1. Services 2-Column Grid (Only real existing modules) */}
        {activeSubTab === 'Services' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {realServices.map((svc) => (
              <div
                key={svc.id}
                onClick={() => handleServiceClick(svc)}
                className="bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-[#222834] rounded-[6px] border border-slate-200/90 dark:border-[#282F3D] px-4 py-3 shadow-xs transition-all cursor-pointer flex items-center gap-3 group"
              >
                <div className={`p-2 rounded-[5px] border ${svc.iconColor} shrink-0`}>
                  {svc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#0284C7] dark:group-hover:text-[#38BDF8] transition-colors truncate">
                    {svc.title}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. Branches & Locations */}
        {activeSubTab === 'Location' && (
          <div className="space-y-3">
            {branches.length === 0 ? (
              <div className="bg-white dark:bg-[#1B2028] rounded-[6px] border border-slate-200 dark:border-[#282F3D] p-10 text-center shadow-xs">
                <div className="text-xs text-slate-400">No locations configured</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="bg-white dark:bg-[#1B2028] rounded-[6px] border border-slate-200 dark:border-[#282F3D] p-3.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {branch.name}
                      </h4>
                      {branch.isHQ && (
                        <span className="text-[9px] font-bold bg-sky-100 dark:bg-sky-950 text-[#0284C7] px-1.5 py-0.2 rounded">
                          HQ
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {branch.address.city}, {branch.address.state} — {branch.address.pinCode}
                    </p>
                    <div className="mt-2 text-[10px] text-slate-400">
                      👥 {branch.employeeCount} Assigned Members · {branch.timezone}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Quick Link Modal */}
      {isAddLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1B2028] rounded-[8px] max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-[#282F3D]">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              Add Quick Link
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Create a shortcut to an EMS module on your overview page.
            </p>
            <form onSubmit={handleCreateLink} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Link Title
                </label>
                <input
                  type="text"
                  required
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="e.g. Leave Tracker"
                  className="w-full text-xs p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#12161E] text-slate-900 dark:text-white rounded focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Target Module
                </label>
                <Select value={newLinkModule} onChange={(e) => setNewLinkModule(e.target.value)}>
                  <option value="home">Home / Overview</option>
                  <option value="attendance">Attendance</option>
                  <option value="timesheet">Time Tracker</option>
                  <option value="time-off">Leave Tracker</option>
                  <option value="teams">Teams & Squads</option>
                  <option value="projects">Projects</option>
                  <option value="payroll">Payroll</option>
                  <option value="approvals">Approvals</option>
                  <option value="files">Files</option>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddLinkModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-[#0284C7] hover:bg-[#0369A1] text-white rounded font-semibold transition-colors cursor-pointer"
                >
                  Add Shortcut
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
