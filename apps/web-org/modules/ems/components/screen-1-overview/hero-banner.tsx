import React from 'react';

interface HeroBannerProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function HeroBanner({ activeTab, onSelectTab }: HeroBannerProps) {
  const topTabs = ['Overview', 'Dashboard', 'Calendar'];

  return (
    <div className="relative w-full">
      {/* Top Space Sub-Navigation Bar (Sticky) */}
      <div className="sticky top-0 z-30 h-10 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-6 h-full">
          {topTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onSelectTab(tab)}
                className={`h-full text-xs font-semibold px-1.5 flex items-center transition-colors relative cursor-pointer ${
                  isActive
                    ? 'text-[#0284C7] border-b-2 border-[#0284C7]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hero Banner with Softened Botanical Foliage */}
      <div className="relative h-32 sm:h-36 w-full bg-slate-900 overflow-hidden flex items-start justify-end p-3.5">
        {/* Softened foliage imagery backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center brightness-[0.70] contrast-[1.05]"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1600&q=80')`,
          }}
        />
        {/* Subtle dark gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/30 to-black/20 pointer-events-none" />

        {/* Right Corner Menu */}
        <div className="relative z-10 flex items-center gap-2">
          <button
            className="p-1.5 bg-black/40 hover:bg-black/60 text-white rounded-[4px] backdrop-blur-sm transition-colors text-xs border border-white/10 cursor-pointer"
            title="More actions"
            aria-label="More options"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

