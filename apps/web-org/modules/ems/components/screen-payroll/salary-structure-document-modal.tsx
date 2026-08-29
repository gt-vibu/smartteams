'use client';

import React from 'react';
import { Button, Badge, Dialog, DialogContent } from '@smarteam/ui';
import { formatINR } from '../../utils/formatters';

export interface SalaryStructureDocumentData {
  structureName: string;
  structureCode: string;
  effectiveFrom: string;
  employeeName?: string;
  employeeNumber?: string;
  jobTitle?: string;
  department?: string;
  annualCtc: number;
  monthlyCtc: number;
  earnings: { name: string; monthly: number; annual: number }[];
  deductions: { name: string; monthly: number; annual: number }[];
  employerContributions: { name: string; monthly: number; annual: number }[];
  grossSalary: number;
  totalDeductions: number;
  netTakeHome: number;
}

interface SalaryStructureDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SalaryStructureDocumentData | null;
}

export function SalaryStructureDocumentModal({
  isOpen,
  onClose,
  data,
}: SalaryStructureDocumentModalProps) {
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border border-slate-200 dark:border-slate-800">
        {/* Document Action Header */}
        <div className="p-4 bg-slate-50 dark:bg-[#161B22] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Official Compensation Structure Statement
            </span>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {data.structureName} · Effective: {data.effectiveFrom}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs">
              <span>🖨</span>
              <span>Print / Save as PDF</span>
            </Button>
            <Button size="sm" onClick={onClose} className="text-xs">
              Done
            </Button>
          </div>
        </div>

        {/* Printable Document Paper */}
        <div className="p-6 space-y-5 bg-white dark:bg-[#1B2028] text-slate-900 dark:text-slate-100 text-xs">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-[#0284C7] text-white font-bold flex items-center justify-center text-xs">
                  S
                </div>
                <span className="font-bold text-sm tracking-tight">
                  Smarteam Technologies Pvt. Ltd.
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                Embassy TechVillage, Outer Ring Road, Bengaluru, Karnataka 560103
                <br />
                CIN: U72200KA2024PTC189000 · PAN: AAHCS4921K · TAN: BLRS09123D
              </p>
            </div>

            <div className="text-right">
              <Badge variant="sky" className="font-mono text-[10px]">
                SALARY ANNEXURE
              </Badge>
              <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                Annual CTC: {formatINR(data.annualCtc)}
              </div>
            </div>
          </div>

          {/* Employee & Structure Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-400 text-[10px] block">Staff Name</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {data.employeeName || 'Staff Member'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Employee ID</span>
              <span className="font-mono font-semibold">{data.employeeNumber || 'EMP-064'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Role / Designation</span>
              <span className="font-medium">{data.jobTitle || 'Software Engineer'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Department</span>
              <span className="font-medium">{data.department || 'Engineering & Technology'}</span>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-100 dark:bg-[#12171F] px-4 py-2 font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex justify-between">
              <span>Salary Component</span>
              <div className="flex gap-12">
                <span>Monthly (₹)</span>
                <span>Annual (₹)</span>
              </div>
            </div>

            {/* Earnings Section */}
            <div className="p-3.5 space-y-2 border-b border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-bold text-slate-400 uppercase">
                1. Gross Earnings
              </div>
              {data.earnings.map((e, idx) => (
                <div key={idx} className="flex justify-between font-mono text-xs">
                  <span className="font-sans text-slate-700 dark:text-slate-300">{e.name}</span>
                  <div className="flex gap-12 font-semibold">
                    <span className="w-20 text-right">{formatINR(e.monthly)}</span>
                    <span className="w-24 text-right">{formatINR(e.annual)}</span>
                  </div>
                </div>
              ))}
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between font-bold text-xs text-sky-700 dark:text-sky-300">
                <span className="font-sans">Total Gross Salary:</span>
                <div className="flex gap-12 font-mono">
                  <span className="w-20 text-right">{formatINR(data.grossSalary)}</span>
                  <span className="w-24 text-right">{formatINR(data.grossSalary * 12)}</span>
                </div>
              </div>
            </div>

            {/* Deductions Section */}
            <div className="p-3.5 space-y-2 border-b border-slate-200 dark:border-slate-800 bg-rose-50/20 dark:bg-rose-950/10">
              <div className="text-[10px] font-bold text-rose-500 uppercase">
                2. Employee Deductions
              </div>
              {data.deductions.map((d, idx) => (
                <div
                  key={idx}
                  className="flex justify-between font-mono text-xs text-rose-600 dark:text-rose-400"
                >
                  <span className="font-sans">{d.name}</span>
                  <div className="flex gap-12 font-semibold">
                    <span className="w-20 text-right">-{formatINR(d.monthly)}</span>
                    <span className="w-24 text-right">-{formatINR(d.annual)}</span>
                  </div>
                </div>
              ))}
              <div className="pt-1.5 border-t border-rose-100 dark:border-rose-900/50 flex justify-between font-bold text-xs text-rose-700 dark:text-rose-300">
                <span className="font-sans">Total Deductions:</span>
                <div className="flex gap-12 font-mono">
                  <span className="w-20 text-right">-{formatINR(data.totalDeductions)}</span>
                  <span className="w-24 text-right">-{formatINR(data.totalDeductions * 12)}</span>
                </div>
              </div>
            </div>

            {/* Net Take-Home Row */}
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 flex justify-between font-bold text-xs text-emerald-800 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800/50">
              <span className="font-sans">Net Take-Home Pay (Disbursed to Bank):</span>
              <div className="flex gap-12 font-mono">
                <span className="w-20 text-right">{formatINR(data.netTakeHome)}</span>
                <span className="w-24 text-right">{formatINR(data.netTakeHome * 12)}</span>
              </div>
            </div>

            {/* Employer Costs Section */}
            <div className="p-3.5 space-y-2 bg-slate-50/50 dark:bg-[#161B22]/50">
              <div className="text-[10px] font-bold text-slate-400 uppercase">
                3. Employer Statutory Contributions (CTC)
              </div>
              {data.employerContributions.map((ec, idx) => (
                <div
                  key={idx}
                  className="flex justify-between font-mono text-xs text-slate-600 dark:text-slate-400"
                >
                  <span className="font-sans">{ec.name}</span>
                  <div className="flex gap-12 font-semibold">
                    <span className="w-20 text-right">{formatINR(ec.monthly)}</span>
                    <span className="w-24 text-right">{formatINR(ec.annual)}</span>
                  </div>
                </div>
              ))}
              <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-xs text-slate-900 dark:text-white">
                <span className="font-sans">Total Cost to Company (CTC):</span>
                <div className="flex gap-12 font-mono">
                  <span className="w-20 text-right">{formatINR(data.monthlyCtc)}</span>
                  <span className="w-24 text-right">{formatINR(data.annualCtc)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <p className="text-[10px] text-center text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            This document represents your official employment compensation annexure with Smarteam
            Technologies Pvt. Ltd.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
