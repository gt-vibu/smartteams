'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import type { MilestoneData } from '../../types/organization.types';

interface OrgMilestonesTabProps {
  milestones: MilestoneData[];
}

export function OrgMilestonesTab({ milestones }: OrgMilestonesTabProps) {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'NEW_HIRE' | 'BIRTHDAY' | 'ANNIVERSARY'>(
    'ALL',
  );
  const [wishedMap, setWishedMap] = useState<Record<string, boolean>>({});

  const filterTabs = [
    { id: 'ALL', label: 'All Celebrations' },
    { id: 'NEW_HIRE', label: 'New Hires' },
    { id: 'BIRTHDAY', label: 'Birthday Folks' },
    { id: 'ANNIVERSARY', label: 'Work Anniversaries' },
  ];

  const filteredMilestones = milestones.filter((m) => {
    if (activeFilter === 'ALL') return true;
    return m.type === activeFilter;
  });

  const handleWish = (id: string) => {
    setWishedMap((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs Strip */}
      <div className="bg-white rounded-[6px] border border-slate-200 p-3 shadow-xs flex items-center space-x-2 overflow-x-auto no-scrollbar">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => {
                if (
                  tab.id === 'ALL' ||
                  tab.id === 'NEW_HIRE' ||
                  tab.id === 'BIRTHDAY' ||
                  tab.id === 'ANNIVERSARY'
                ) {
                  setActiveFilter(tab.id);
                }
              }}
              variant="ghost"
              size="sm"
              className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Milestones Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMilestones.map((item) => {
          const isWished = !!wishedMap[item.id];

          return (
            <div
              key={item.id}
              className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                      item.type === 'BIRTHDAY'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : item.type === 'NEW_HIRE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {item.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 font-mono">
                    {item.date}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {item.avatarInitials}
                  </div>
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {item.employeeName}
                    </h4>
                    <p className="text-[10px] text-slate-500 truncate">{item.jobTitle}</p>
                    <p className="text-[10px] text-slate-600 font-medium truncate">
                      {item.department}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded border border-slate-100 text-xs text-slate-600 font-medium text-center">
                  ✨ {item.badgeText}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">{item.employeeNumber}</span>
                <Button
                  variant={isWished ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => handleWish(item.id)}
                  disabled={isWished}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    isWished
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                  }`}
                >
                  {isWished ? '✓ Sent Wishes' : 'Send Wishes 🎊'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
