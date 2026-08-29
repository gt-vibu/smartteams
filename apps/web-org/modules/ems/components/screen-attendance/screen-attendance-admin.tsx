'use client';

import React, { useState, useMemo } from 'react';
import { StandardDataTable, ColumnDef } from '@smarteam/ui';
import attendanceRecordsFixture from '../../data/fixtures/attendance-records.json';
import { DatePicker } from '../common/date-picker';

interface AttendanceRow {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  branchName: string;
  shiftName: string;
  dayStatus: string;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  source: string;
}

export function ScreenAttendanceAdmin() {
  const [selectedDate, setSelectedDate] = useState('2026-08-27');
  const [selectedRow, setSelectedRow] = useState<AttendanceRow | null>(null);

  const datesData = attendanceRecordsFixture.dates as Record<string, any>;
  const activeDateData = datesData[selectedDate] || {
    summary: { totalEmployees: 24, present: 0, absent: 0, onLeave: 0, holiday: 0, weekend: 0 },
    records: [],
  };

  const records: AttendanceRow[] = useMemo(() => {
    return activeDateData.records as AttendanceRow[];
  }, [activeDateData]);

  const availableDates = Object.keys(datesData).sort();

  const handlePrevDate = () => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx > 0) setSelectedDate(availableDates[idx - 1]!);
  };

  const handleNextDate = () => {
    const idx = availableDates.indexOf(selectedDate);
    if (idx < availableDates.length - 1) setSelectedDate(availableDates[idx + 1]!);
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '-';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const columns: ColumnDef<AttendanceRow>[] = [
    {
      id: 'employeeName',
      header: 'Employee',
      accessorKey: 'employeeName',
      sortable: true,
      pinned: 'left',
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
            {row.employeeName}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {row.employeeNumber} · {row.jobTitle}
          </div>
        </div>
      ),
    },
    {
      id: 'branchName',
      header: 'Branch',
      accessorKey: 'branchName',
      sortable: true,
      filterable: true,
      cell: (row) => <span className="text-slate-600">{row.branchName}</span>,
    },
    {
      id: 'shiftName',
      header: 'Shift',
      accessorKey: 'shiftName',
      sortable: true,
      filterable: true,
      cell: (row) => <span className="text-slate-600">{row.shiftName}</span>,
    },
    {
      id: 'dayStatus',
      header: 'Status',
      accessorKey: 'dayStatus',
      sortable: true,
      filterable: true,
      filterOptions: [
        { label: 'Present', value: 'PRESENT' },
        { label: 'Absent', value: 'ABSENT' },
        { label: 'On Leave', value: 'ON_LEAVE' },
      ],
      cell: (row) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
            row.dayStatus === 'PRESENT'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
              : row.dayStatus === 'ON_LEAVE'
                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200/80'
                : 'bg-rose-50 text-rose-700 border border-rose-200/80'
          }`}
        >
          {row.dayStatus}
        </span>
      ),
    },
    {
      id: 'firstIn',
      header: 'First In',
      accessorKey: 'firstIn',
      sortable: true,
      cell: (row) => <span className="font-mono text-slate-700">{row.firstIn || '-'}</span>,
    },
    {
      id: 'lastOut',
      header: 'Last Out',
      accessorKey: 'lastOut',
      sortable: true,
      cell: (row) => <span className="font-mono text-slate-700">{row.lastOut || '-'}</span>,
    },
    {
      id: 'workedMinutes',
      header: 'Worked Duration',
      accessorKey: 'workedMinutes',
      sortable: true,
      cell: (row) => (
        <span className="font-mono font-medium text-slate-800">
          {formatMinutes(row.workedMinutes)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      pinned: 'right',
      sortable: false,
      cell: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRow(row);
          }}
          className="text-[11px] font-bold text-[#0284C7] hover:underline cursor-pointer"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with Title & Date Navigation Controls */}
      <div className="bg-white rounded-[6px] border border-slate-200/90 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
              Admin Governance
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">
              Organization Daily Attendance
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-1">Attendance Operations</h1>
        </div>

        {/* Custom Date Picker + Prev/Next Steppers */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrevDate}
            disabled={availableDates.indexOf(selectedDate) <= 0}
            className="p-1.5 rounded-[5px] border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
            title="Previous Day"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            minDate={availableDates[0]}
            maxDate={availableDates[availableDates.length - 1]}
          />

          <button
            onClick={handleNextDate}
            disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
            className="p-1.5 rounded-[5px] border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
            title="Next Day"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards for Selected Date */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Present
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {activeDateData.summary.present}
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Absent
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            {activeDateData.summary.absent}
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            On Leave
          </div>
          <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
            {activeDateData.summary.onLeave}
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Holiday
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            {activeDateData.summary.holiday}
          </div>
        </div>
        <div className="bg-white dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Rostered
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
            {activeDateData.summary.totalEmployees}
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Data Table */}
      <StandardDataTable
        data={records}
        columns={columns}
        keyExtractor={(row) => row.id}
        searchPlaceholder="Search employee name, ID, branch, or shift..."
        onRowClick={setSelectedRow}
        initialRowsPerPage={10}
      />

      {/* Attendance Detail Slide-Over Drawer */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
          <div
            onClick={() => setSelectedRow(null)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
          />
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-[#1B2028] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#161B22] flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                    {selectedRow.employeeNumber}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {selectedRow.employeeName}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedRow.jobTitle} · {selectedRow.department}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1 overflow-y-auto text-xs">
                <div className="bg-slate-50 dark:bg-[#161B22] p-3 rounded-lg border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Date</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedDate}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Day Status
                    </span>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {selectedRow.dayStatus}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      First Punch In
                    </span>
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedRow.firstIn || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Last Punch Out
                    </span>
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedRow.lastOut || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Worked Minutes
                    </span>
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedRow.workedMinutes} mins
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Overtime</span>
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedRow.overtimeMinutes} mins
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                    Punch Stream Source
                  </h3>
                  <div className="p-3 bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        Native Mobile / Web Punch
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Biometric & Geofence Verified
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded font-bold">
                      {selectedRow.source}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161B22]">
                <button
                  onClick={() => setSelectedRow(null)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 dark:bg-[#0284C7] dark:hover:bg-[#0369A1] text-white font-bold rounded text-xs cursor-pointer transition-colors"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
