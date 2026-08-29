'use client';

import React from 'react';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';

export function OrgCalendarTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[6px] border border-slate-200 p-4 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-900">
            Organization Holiday & Shift Calendar
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enterprise-wide statutory holidays, shift assignments, and scheduled office non-working
            days.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs p-1">
        <Screen4Calendar />
      </div>
    </div>
  );
}
