'use client';

import React, { useState, useEffect } from 'react';

export interface EditablePayrollLineItem {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  regularDays: number;
  paidLeaves: number;
  lossOfPayDays: number;
  earnings: { code: string; name: string; amount: number }[];
  deductions: { code: string; name: string; amount: number }[];
}

interface EditPayrollLineItemModalProps {
  isOpen: boolean;
  item: EditablePayrollLineItem | null;
  onClose: () => void;
  onSave: (updatedItem: EditablePayrollLineItem) => void;
}

import { formatINR } from '../../utils/formatters';

export function EditPayrollLineItemModal({
  isOpen,
  item,
  onClose,
  onSave,
}: EditPayrollLineItemModalProps) {
  const [regularDays, setRegularDays] = useState(22);
  const [lossOfPayDays, setLossOfPayDays] = useState(0);
  const [earnings, setEarnings] = useState<{ code: string; name: string; amount: number }[]>([]);
  const [deductions, setDeductions] = useState<{ code: string; name: string; amount: number }[]>(
    [],
  );

  useEffect(() => {
    if (item) {
      setRegularDays(item.regularDays);
      setLossOfPayDays(item.lossOfPayDays);
      setEarnings(item.earnings ? item.earnings.map((e) => ({ ...e })) : []);
      setDeductions(item.deductions ? item.deductions.map((d) => ({ ...d })) : []);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const currentGross = earnings.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const currentDeductions = deductions.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const currentNet = Math.max(0, currentGross - currentDeductions);

  const handleEarningChange = (index: number, newAmount: number) => {
    const next = [...earnings];
    if (next[index]) {
      next[index]!.amount = Math.max(0, newAmount);
      setEarnings(next);
    }
  };

  const handleDeductionChange = (index: number, newAmount: number) => {
    const next = [...deductions];
    if (next[index]) {
      next[index]!.amount = Math.max(0, newAmount);
      setDeductions(next);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: EditablePayrollLineItem = {
      ...item,
      regularDays: Number(regularDays),
      lossOfPayDays: Number(lossOfPayDays),
      earnings,
      deductions,
      grossAmount: currentGross,
      deductionAmount: currentDeductions,
      netAmount: currentNet,
    };
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1E293B] rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                {item.employeeNumber}
              </span>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Edit Payroll Record: {item.employeeName}
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {item.jobTitle} · {item.department}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Working Days & Attendance Overrides */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-[6px] border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                Regular Working Days
              </label>
              <input
                type="number"
                min="0"
                max="31"
                value={regularDays}
                onChange={(e) => setRegularDays(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                Loss of Pay (LOP) Days
              </label>
              <input
                type="number"
                min="0"
                max="31"
                value={lossOfPayDays}
                onChange={(e) => setLossOfPayDays(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold text-rose-600"
              />
            </div>
          </div>

          {/* Earnings Components Editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                Earnings Components
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                Gross: {formatINR(currentGross)}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900/30 rounded border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {earnings.map((e, idx) => (
                <div key={e.code} className="p-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{e.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={e.amount}
                      onChange={(ev) => handleEarningChange(idx, Number(ev.target.value))}
                      className="w-32 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-right font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deductions Components Editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                Statutory & Tax Deductions
              </h3>
              <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                Total: -{formatINR(currentDeductions)}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900/30 rounded border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {deductions.map((d, idx) => (
                <div key={d.code} className="p-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={d.amount}
                      onChange={(ev) => handleDeductionChange(idx, Number(ev.target.value))}
                      className="w-32 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-right font-mono font-bold text-rose-600 dark:text-rose-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calculated Net Take-Home Highlight */}
          <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 tracking-wider">
                Recalculated Net Pay
              </span>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {formatINR(currentNet)}
              </div>
            </div>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
              Updates active run totals on save
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded shadow-xs cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
