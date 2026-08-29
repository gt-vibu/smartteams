'use client';

import React from 'react';
import { BotanicalCover } from '../layout/botanical-cover';

interface HeroBannerProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function HeroBanner({ activeTab, onSelectTab }: HeroBannerProps) {
  const topTabs = ['Overview', 'Dashboard', 'Calendar'];

  return (
    <div className="relative w-full">
      {/* Top Space Sub-Navigation Bar (Sticky) */}
      <div className="sticky top-0 z-30 h-10 bg-white/95 dark:bg-[#16191E]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-[#262F3D] px-4 sm:px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-6 h-full">
          {topTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onSelectTab(tab)}
                className={`h-full text-xs font-semibold px-1 flex items-center transition-colors relative cursor-pointer ${
                  isActive
                    ? 'text-[#0284C7] dark:text-[#38BDF8] border-b-2 border-[#0284C7] dark:border-[#38BDF8]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hero Banner with Botanical Foliage */}
      <BotanicalCover heightClass="h-32 sm:h-36" />
    </div>
  );
}
