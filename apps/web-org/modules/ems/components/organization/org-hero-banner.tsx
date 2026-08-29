'use client';

import React, { useState } from 'react';
import { OrganizationData } from '../../types/organization.types';
import { BotanicalCover } from '../layout/botanical-cover';

interface OrgHeroBannerProps {
  organization: OrganizationData;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onUpdateCoverUrl?: (url: string) => void;
}

export function OrgHeroBanner({
  organization,
  activeTab,
  onSelectTab,
  onUpdateCoverUrl,
}: OrgHeroBannerProps) {
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState('');

  const subTabs = [
    { id: 'Overview', label: 'Overview' },
    { id: 'Announcements', label: 'Announcements' },
    { id: 'Policies', label: 'Policies' },
    { id: 'Employee Tree', label: 'Employee Tree' },
    { id: 'Department Tree', label: 'Department Tree' },
    { id: 'Department Directory', label: 'Department Directory' },
    { id: 'New Hires & Birthdays', label: 'Birthday Folks' },
    { id: 'New Hires', label: 'New Hires' },
    { id: 'Calendar', label: 'Calendar' },
  ];

  const handleSaveCover = (e: React.FormEvent) => {
    e.preventDefault();
    if (customCoverUrl.trim()) {
      onUpdateCoverUrl?.(customCoverUrl.trim());
      setIsEditingCover(false);
      setCustomCoverUrl('');
    }
  };

  return (
    <div className="relative w-full">
      {/* 1. Sticky Sub-Navigation Tabs Bar */}
      <div className="sticky top-0 z-30 h-10 bg-white/95 dark:bg-[#16191E]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-[#262F3D] px-4 sm:px-6 flex items-center justify-between overflow-x-auto no-scrollbar shadow-xs">
        <div className="flex items-center space-x-4 sm:space-x-6 h-full min-w-max">
          {subTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`h-full text-xs font-semibold px-1 flex items-center transition-colors relative cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'text-[#0284C7] dark:text-[#38BDF8] border-b-2 border-[#0284C7] dark:border-[#38BDF8]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Full-Width Botanical Cover Banner */}
      <BotanicalCover
        coverUrl={organization.coverUrl}
        onEditCover={() => setIsEditingCover(true)}
        heightClass="h-44 sm:h-52"
      />

      {/* Edit Cover URL Modal */}
      {isEditingCover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#1C222B] rounded-lg shadow-xl border border-slate-200 dark:border-[#282F3D] p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Update Cover Photo URL
            </h3>
            <form onSubmit={handleSaveCover} className="space-y-3">
              <input
                type="url"
                required
                placeholder="https://images.unsplash.com/photo-..."
                value={customCoverUrl}
                onChange={(e) => setCustomCoverUrl(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#12161E] text-slate-900 dark:text-white rounded focus:ring-1 focus:ring-sky-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingCover(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded cursor-pointer"
                >
                  Save Photo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
