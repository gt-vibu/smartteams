'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@smarteam/ui';

import React from 'react';
import { useAttendance } from '../../hooks/use-attendance';

export function OverviewAttendancePreviewTab() {
  const { records } = useAttendance();

  const totalWorkingDays = records.length;
  const presentDays = records.filter((r) => r.dayStatus === 'PRESENT').length;
  const leaveDays = records.filter((r) => r.dayStatus === 'LEAVE').length;
  const holidayDays = records.filter((r) => r.dayStatus === 'HOLIDAY').length;

  return (
    <div className="space-y-4">
      {/* Attendance Summary Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-[6px] border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Tracked Days</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{totalWorkingDays}</div>
        </div>
        <div className="bg-white p-3 rounded-[6px] border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-emerald-600">Present Days</div>
          <div className="text-lg font-bold text-emerald-700 mt-0.5">{presentDays}</div>
        </div>
        <div className="bg-white p-3 rounded-[6px] border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-sky-600">On Leave</div>
          <div className="text-lg font-bold text-sky-700 mt-0.5">{leaveDays}</div>
        </div>
        <div className="bg-white p-3 rounded-[6px] border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-purple-600">Statutory Holidays</div>
          <div className="text-lg font-bold text-purple-700 mt-0.5">{holidayDays}</div>
        </div>
      </div>

      {/* Recent Daily Punch Logs Table */}
      <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800">
            Attendance Log Preview (Current Pay Period)
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">
            Shift: General (10:00 AM – 6:00 PM)
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100/60 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
              <TableHead className="py-2.5 px-4">Date</TableHead>
              <TableHead className="py-2.5 px-3">Day</TableHead>
              <TableHead className="py-2.5 px-3">First In</TableHead>
              <TableHead className="py-2.5 px-3">Last Out</TableHead>
              <TableHead className="py-2.5 px-3">Payable Hours</TableHead>
              <TableHead className="py-2.5 px-3 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {records.slice(0, 7).map((r) => (
              <TableRow key={r.id} className="hover:bg-slate-50/60 transition-colors">
                <TableCell className="py-2.5 px-4 font-mono font-semibold text-slate-800">
                  {r.workDate}
                </TableCell>
                <TableCell className="py-2.5 px-3 text-slate-500">{r.dayOfWeek}</TableCell>
                <TableCell className="py-2.5 px-3 font-mono text-slate-700">
                  {r.firstInTime || '—'}
                </TableCell>
                <TableCell className="py-2.5 px-3 font-mono text-slate-700">
                  {r.lastOutTime || '—'}
                </TableCell>
                <TableCell className="py-2.5 px-3 font-bold text-slate-800 font-mono">
                  {r.payableHours ||
                    `${Math.floor(r.workedMinutes / 60)}h ${r.workedMinutes % 60}m`}
                </TableCell>
                <TableCell className="py-2.5 px-3 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                      r.dayStatus === 'PRESENT'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.dayStatus === 'LEAVE'
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : r.dayStatus === 'HOLIDAY'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {r.dayStatus}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
