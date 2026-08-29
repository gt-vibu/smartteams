'use client';

import React from 'react';
import { Button, Badge, Dialog, DialogContent } from '@smarteam/ui';
import { formatINR } from '../../utils/formatters';

export interface PayslipData {
  id: string;
  payrollRunCode: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  branchName: string;
  bankName?: string;
  accountNumber?: string;
  panNumber?: string;
  uanNumber?: string;
  pfNumber?: string;
  esiNumber?: string;
  taxRegime?: string;
  totalWorkingDays: number;
  paidDays: number;
  lossOfPayDays: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employerContributions: { name: string; amount: number }[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerCost: number;
}

interface PayslipDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslip: PayslipData | null;
}

export function PayslipDocumentModal({ isOpen, onClose, payslip }: PayslipDocumentModalProps) {
  if (!payslip) return null;

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
              Official Salary Statement
            </span>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {payslip.payrollRunCode} · Pay Date: {payslip.payDate}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs">
              <span>🖨</span>
              <span>Print / PDF</span>
            </Button>
            <Button size="sm" onClick={onClose} className="text-xs">
              Done
            </Button>
          </div>
        </div>

        {/* Printable Document Paper */}
        <div className="p-6 space-y-5 bg-white dark:bg-[#1B2028] text-slate-900 dark:text-slate-100 text-xs">
          {/* Company Branding & Statement Title */}
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
              <Badge variant="secondary" className="font-mono text-[10px]">
                CONFIDENTIAL
              </Badge>
              <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                Payslip for{' '}
                {new Date(payslip.periodStart).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Employee & Attendance Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#161B22] p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-400 text-[10px] block">Employee Name</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {payslip.employeeName}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Employee ID</span>
              <span className="font-mono font-semibold">{payslip.employeeNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Designation / Role</span>
              <span className="font-medium">{payslip.jobTitle}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Department</span>
              <span className="font-medium">{payslip.department}</span>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] block">PAN Number</span>
              <span className="font-mono font-semibold">{payslip.panNumber || 'AAAPM0192L'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">UAN / PF Number</span>
              <span className="font-mono font-semibold">{payslip.uanNumber || '101928374650'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Bank Account</span>
              <span className="font-mono font-semibold">
                {payslip.accountNumber || '•••• 8920 (HDFC)'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Tax Regime</span>
              <span className="font-medium">{payslip.taxRegime || 'New Regime (Sec 115BAC)'}</span>
            </div>
          </div>

          {/* Days Summary Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100/70 dark:bg-slate-800/50 p-2.5 rounded text-center text-[11px] font-medium border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Total Calendar Days: </span>
              <span className="font-bold font-mono">{payslip.totalWorkingDays}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Payable Days: </span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {payslip.paidDays}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Loss of Pay (LOP): </span>
              <span className="font-bold font-mono text-rose-600 dark:text-rose-400">
                {payslip.lossOfPayDays}
              </span>
            </div>
          </div>

          {/* Itemized Earnings & Deductions Tables (Side by Side) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Earnings */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
              <div>
                <div className="bg-slate-100 dark:bg-[#12171F] px-3.5 py-2 font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex justify-between">
                  <span>Earnings & Allowances</span>
                  <span>Amount (₹)</span>
                </div>
                <div className="p-3 space-y-2 divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-xs">
                  {payslip.earnings.map((e, idx) => (
                    <div key={idx} className="flex justify-between pt-1.5 first:pt-0">
                      <span className="font-sans text-slate-700 dark:text-slate-300">{e.name}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatINR(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-sky-50/70 dark:bg-[#152438] px-3.5 py-2.5 border-t border-sky-200 dark:border-sky-800/60 flex justify-between font-bold text-xs">
                <span>Gross Earnings:</span>
                <span className="font-mono text-sky-700 dark:text-sky-300">
                  {formatINR(payslip.grossEarnings)}
                </span>
              </div>
            </div>

            {/* Right: Employee Deductions */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
              <div>
                <div className="bg-slate-100 dark:bg-[#12171F] px-3.5 py-2 font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex justify-between">
                  <span>Employee Deductions</span>
                  <span>Amount (₹)</span>
                </div>
                <div className="p-3 space-y-2 divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-xs">
                  {payslip.deductions.map((d, idx) => (
                    <div key={idx} className="flex justify-between pt-1.5 first:pt-0">
                      <span className="font-sans text-slate-700 dark:text-slate-300">{d.name}</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        -{formatINR(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2.5 border-t border-rose-200 dark:border-rose-800/60 flex justify-between font-bold text-xs">
                <span>Total Deductions:</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">
                  -{formatINR(payslip.totalDeductions)}
                </span>
              </div>
            </div>
          </div>

          {/* Net Pay Highlight Banner */}
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                Net Take-Home Pay (Disbursed to Bank)
              </span>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gross Earnings ({formatINR(payslip.grossEarnings)}) - Total Deductions (
                {formatINR(payslip.totalDeductions)})
              </div>
            </div>

            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              {formatINR(payslip.netPay)}
            </div>
          </div>

          {/* Employer Contributions & CTC Provisions */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50/50 dark:bg-[#161B22]/50 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Employer Statutory Contributions & Provisions (Not Deducted from Pay):
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                Total CTC: {formatINR(payslip.totalEmployerCost)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
              {payslip.employerContributions.map((ec, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="font-sans">{ec.name}:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatINR(ec.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <p className="text-[10px] text-center text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            This is a system-generated salary statement authorized under Smarteam EMS Payroll
            Engine. No signature required.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
