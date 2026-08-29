'use client';

import React, { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  placeholder?: string;
  className?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseDate(str: string): Date | null {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplay(str: string): string {
  const d = parseDate(str);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  className = '',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = parseDate(value);
    return d ? d.getFullYear() : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d = parseDate(value);
    return d ? d.getMonth() : new Date().getMonth();
  });
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setMode('days');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync view to selected value when opening
  const handleOpen = () => {
    const d = parseDate(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setIsOpen((prev) => !prev);
    setMode('days');
  };

  const selectedDate = parseDate(value);
  const minD = parseDate(minDate || '');
  const maxD = parseDate(maxDate || '');

  // Build calendar days
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number; month: 'prev' | 'current' | 'next'; date: Date }> = [];
  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      const day = daysInPrevMonth - firstDay + i + 1;
      cells.push({ day, month: 'prev', date: new Date(viewYear, viewMonth - 1, day) });
    } else if (i < firstDay + daysInMonth) {
      const day = i - firstDay + 1;
      cells.push({ day, month: 'current', date: new Date(viewYear, viewMonth, day) });
    } else {
      const day = i - firstDay - daysInMonth + 1;
      cells.push({ day, month: 'next', date: new Date(viewYear, viewMonth + 1, day) });
    }
  }

  const isDisabled = (date: Date) => {
    if (minD && date < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())) return true;
    if (maxD && date > new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate())) return true;
    return false;
  };

  const isSelected = (date: Date) => {
    return selectedDate ? toYMD(date) === toYMD(selectedDate) : false;
  };

  const isToday = (date: Date) => {
    return toYMD(date) === toYMD(new Date());
  };

  const handleSelectDay = (date: Date) => {
    if (isDisabled(date)) return;
    onChange(toYMD(date));
    setIsOpen(false);
    setMode('days');
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  // Year range
  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i);

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-2.5 px-3 py-1.5 bg-white border rounded-[6px] text-xs font-semibold transition-all cursor-pointer shadow-xs select-none ${
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20 text-slate-900'
            : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        {/* Calendar icon */}
        <svg
          className="h-3.5 w-3.5 text-slate-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-slate-400 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Calendar Panel */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-[10px] shadow-2xl overflow-hidden w-[264px] animate-in fade-in zoom-in-95 duration-100">
          {/* ── Header: Month/Year navigation ── */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
            <button
              type="button"
              onClick={prevMonth}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
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

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode(mode === 'months' ? 'days' : 'months')}
                className="px-2 py-0.5 rounded text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {MONTHS[viewMonth]}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === 'years' ? 'days' : 'years')}
                className="px-2 py-0.5 rounded text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {viewYear}
              </button>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
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

          {/* ── Month Picker Grid ── */}
          {mode === 'months' && (
            <div className="grid grid-cols-3 gap-1 p-3">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setViewMonth(i);
                    setMode('days');
                  }}
                  className={`py-1.5 text-[11px] font-semibold rounded-[5px] transition-colors cursor-pointer ${
                    i === viewMonth
                      ? 'bg-[#0284C7] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* ── Year Picker Grid ── */}
          {mode === 'years' && (
            <div className="grid grid-cols-4 gap-1 p-3">
              {yearRange.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setViewYear(y);
                    setMode('days');
                  }}
                  className={`py-1.5 text-[11px] font-semibold rounded-[5px] transition-colors cursor-pointer ${
                    y === viewYear ? 'bg-[#0284C7] text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* ── Day Grid ── */}
          {mode === 'days' && (
            <div className="p-3 pt-2.5">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((cell, i) => {
                  const disabled = isDisabled(cell.date);
                  const selected = isSelected(cell.date);
                  const today = isToday(cell.date);
                  const isOtherMonth = cell.month !== 'current';

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectDay(cell.date)}
                      disabled={disabled}
                      className={`h-7 w-full flex items-center justify-center text-[11px] font-medium rounded-[5px] transition-all cursor-pointer ${
                        disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : selected
                            ? 'bg-[#0284C7] text-white font-bold shadow-sm'
                            : today
                              ? 'border border-sky-400 text-sky-700 font-bold hover:bg-sky-50'
                              : isOtherMonth
                                ? 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Footer: Today shortcut ── */}
          <div className="border-t border-slate-100 px-3 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const today = toYMD(new Date());
                onChange(today);
                setIsOpen(false);
                setMode('days');
              }}
              className="text-[11px] font-semibold text-[#0284C7] hover:underline cursor-pointer"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="text-[11px] font-medium text-slate-400 hover:text-rose-500 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
