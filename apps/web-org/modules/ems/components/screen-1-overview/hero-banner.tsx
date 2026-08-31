'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
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
      <div className="sticky top-0 z-30 h-10 bg-white/95 dark:bg-card/95 backdrop-blur-md border-b border-slate-200/90 dark:border-border px-4 sm:px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-6 h-full">
          {topTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Button
                key={tab}
                onClick={() => onSelectTab(tab)}
                className={`h-full text-xs font-semibold px-1 flex items-center transition-colors relative cursor-pointer ${
                  isActive
                    ? 'text-primary dark:text-primary border-b-2 border-primary dark:border-primary'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Hero Banner with Botanical Foliage */}
      <BotanicalCover heightClass="h-32 sm:h-36" />
    </div>
  );
}
