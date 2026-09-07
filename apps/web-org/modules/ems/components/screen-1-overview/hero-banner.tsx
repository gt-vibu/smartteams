'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@smarteam/ui';
import { BotanicalCover } from '../layout/botanical-cover';

interface HeroBannerProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

const TOP_TABS = ['Overview', 'Dashboard', 'Calendar'];

export function HeroBanner({ activeTab, onSelectTab }: HeroBannerProps) {
  return (
    <div className="relative w-full">
      {/* Sticky space sub-navigation */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-30 flex h-10 items-center justify-between border-b border-border bg-card/95 px-4 shadow-xs backdrop-blur-md sm:px-6">
        {/*
          Underline tabs, not filled buttons. These previously rendered with the Button
          component's `default` variant (solid `bg-slate-900`), which fought the underline
          styling and left the inactive labels as low-contrast grey on a dark fill.
        */}
        <Tabs
          aria-label="Workspace views"
          className="h-full"
          onValueChange={onSelectTab}
          value={activeTab}
        >
          <TabsList className="h-full gap-6 rounded-none bg-transparent p-0">
            {TOP_TABS.map((tab) => (
              <TabsTrigger
                className="h-full rounded-none border-b-2 border-transparent px-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                key={tab}
                value={tab}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Hero banner with botanical foliage */}
      <BotanicalCover heightClass="h-32 sm:h-36" />
    </div>
  );
}
