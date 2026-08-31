import React from 'react';
import type { LeaveBalanceItem } from '../../types/leave.types';

interface LeaveBalanceCardsProps {
  balances: LeaveBalanceItem[];
}

export function LeaveBalanceCards({ balances }: LeaveBalanceCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {balances.map((b) => {
        const percentage = Math.round((b.remainingDays / b.totalEntitlement) * 100);

        return (
          <div
            key={b.id}
            className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between"
          >
            {/* Header with Type & Code Pill */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-850 truncate">{b.leaveTypeName}</span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {b.code}
              </span>
            </div>

            {/* Remaining Days Counter */}
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                {b.remainingDays}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                / {b.totalEntitlement} Days Available
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full ${b.colorClass}`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Sub-Metric Breakdown */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              <span>
                Used: <strong className="text-slate-700">{b.usedDays}</strong>
              </span>
              <span>
                Pending: <strong className="text-slate-700">{b.pendingDays}</strong>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
