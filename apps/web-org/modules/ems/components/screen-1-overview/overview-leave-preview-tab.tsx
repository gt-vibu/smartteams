'use client';

import React from 'react';
import { useLeave } from '../../hooks/use-leave';

export function OverviewLeavePreviewTab() {
  const { balances, applications } = useLeave();

  return (
    <div className="space-y-4">
      {/* Leave Balances Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {balances.map((b) => (
          <div
            key={b.code}
            className="bg-white p-3.5 rounded-[6px] border border-slate-200/90 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {b.code}
              </span>
              <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                {b.leaveTypeName}
              </span>
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {b.remainingDays}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {b.totalEntitlement} days
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {b.usedDays} used · {b.pendingDays} pending
            </div>
          </div>
        ))}
      </div>

      {/* Recent Leave Requests Preview Table */}
      <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800">My Recent Leave Applications</h4>
          <span className="text-[10px] text-slate-400">Live balance synchronization</span>
        </div>

        {applications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No recent leave applications submitted.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                <th className="py-2.5 px-4">Leave Scheme</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Days</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{app.leaveTypeName}</td>
                  <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                    {app.startDate} to {app.endDate}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-700">{app.dayCount} Day(s)</td>
                  <td className="py-2.5 px-3 text-slate-500 truncate max-w-xs">{app.reason}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                        app.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : app.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {app.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
