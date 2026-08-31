'use client';

import React, { useState } from 'react';
import { Button, Input } from '@smarteam/ui';
import type { OrganizationData } from '../../types/organization.types';
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
      <div className="sticky top-0 z-30 h-10 bg-white/95 dark:bg-card/95 backdrop-blur-md border-b border-slate-200/90 dark:border-border px-4 sm:px-6 flex items-center justify-between overflow-x-auto no-scrollbar shadow-xs">
        <div className="flex items-center space-x-4 sm:space-x-6 h-full min-w-max">
          {subTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`h-full text-xs font-semibold px-1 flex items-center transition-colors relative cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'text-primary dark:text-primary border-b-2 border-primary dark:border-primary'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </Button>
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
          <div className="w-full max-w-md bg-white dark:bg-card rounded-lg shadow-xl border border-slate-200 dark:border-[var(--border)] p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Update Cover Photo URL
            </h3>
            <form onSubmit={handleSaveCover} className="space-y-3">
              <Input
                type="url"
                required
                placeholder="https://images.unsplash.com/photo-..."
                value={customCoverUrl}
                onChange={(e) => setCustomCoverUrl(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#12161E] text-slate-900 dark:text-white rounded focus:ring-1 focus:ring-sky-500"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setIsEditingCover(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded cursor-pointer"
                >
                  Save Photo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
