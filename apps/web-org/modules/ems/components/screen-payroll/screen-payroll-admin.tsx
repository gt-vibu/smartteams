'use client';

import React, { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Label,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@smarteam/ui';
import payrollDataFixture from '../../data/fixtures/payroll-runs.json';
import { useAuth } from '../../hooks/use-auth';
import { ScreenPayrollLegalConfig } from './screen-payroll-legal-config';
import { PayrollStructureBuilder } from './payroll-structure-builder';
import { EditPayrollLineItemModal, EditablePayrollLineItem } from './edit-payroll-line-item-modal';
import { PayslipDocumentModal, PayslipData } from './payslip-document-modal';
import { emsStorageAdapter } from '../../storage/storage.adapter';
import { formatINR, formatDateRange } from '../../utils/formatters';

export interface PayrollRun {
  id: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  payFrequency: string;
  currencyCode: string;
  status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'RELEASED';
  employeeCount: number;
  grossTotal: number;
  deductionsTotal: number;
  netTotal: number;
  createdAt: string;
  calculatedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
}

const STORAGE_KEY_PAYROLL_RUNS = 'ems_payroll_runs_list';
const STORAGE_KEY_PAYROLL_ITEMS = 'ems_payroll_line_items';

export function ScreenPayrollAdmin() {
  const { canApprove } = useAuth();
  const [activeMainTab, setActiveMainTab] = useState<
    'RUNS' | 'COMPENSATION' | 'STATUTORY' | 'EMPLOYEE_PAY'
  >('RUNS');
  const [runs, setRuns] = useState<PayrollRun[]>(() => {
    return emsStorageAdapter.getItem<PayrollRun[]>(
      STORAGE_KEY_PAYROLL_RUNS,
      payrollDataFixture.runs as PayrollRun[],
    );
  });
  const [lineItems, setLineItems] = useState<EditablePayrollLineItem[]>(() => {
    return emsStorageAdapter.getItem<EditablePayrollLineItem[]>(
      STORAGE_KEY_PAYROLL_ITEMS,
      payrollDataFixture.lineItems as EditablePayrollLineItem[],
    );
  });
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(runs[0] || null);
  const [editingLineItem, setEditingLineItem] = useState<EditablePayrollLineItem | null>(null);
  const [isStartRunModalOpen, setIsStartRunModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [activePayslipModalData, setActivePayslipModalData] = useState<PayslipData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New run form state
  const [newPeriodMonth, setNewPeriodMonth] = useState('09');
  const [newPeriodYear, setNewPeriodYear] = useState('2026');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleStartNewRun = (e: React.FormEvent) => {
    e.preventDefault();
    const code = `PR-${newPeriodYear}-${newPeriodMonth}`;
    const start = `${newPeriodYear}-${newPeriodMonth}-01`;
    const end = `${newPeriodYear}-${newPeriodMonth}-30`;

    const newRun: PayrollRun = {
      id: `run-${Date.now()}`,
      code,
      periodStart: start,
      periodEnd: end,
      payDate: end,
      payFrequency: 'MONTHLY',
      currencyCode: 'INR',
      status: 'DRAFT',
      employeeCount: 42,
      grossTotal: 0,
      deductionsTotal: 0,
      netTotal: 0,
      createdAt: new Date().toISOString(),
      calculatedAt: null,
      approvedAt: null,
      releasedAt: null,
    };

    const updated = [newRun, ...runs];
    setRuns(updated);
    setSelectedRun(newRun);
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_RUNS, updated);
    setIsStartRunModalOpen(false);
    showToast(`Draft payroll cycle ${code} created.`);
  };

  const handleCalculatePayroll = (runId: string) => {
    const updated = runs.map((r) => {
      if (r.id === runId) {
        return {
          ...r,
          status: 'CALCULATED' as const,
          grossTotal: 4250000,
          deductionsTotal: 345200,
          netTotal: 3904800,
          calculatedAt: new Date().toISOString(),
        };
      }
      return r;
    });
    setRuns(updated);
    setSelectedRun(updated.find((r) => r.id === runId) || null);
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_RUNS, updated);
    showToast('Payroll calculations completed across all active staff structures.');
  };

  const handleAuthorizePayroll = (runId: string) => {
    const updated = runs.map((r) => {
      if (r.id === runId) {
        return {
          ...r,
          status: 'APPROVED' as const,
          approvedAt: new Date().toISOString(),
        };
      }
      return r;
    });
    setRuns(updated);
    setSelectedRun(updated.find((r) => r.id === runId) || null);
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_RUNS, updated);
    showToast('Payroll run authorized by Head of Finance.');
  };

  const handleDisbursePayroll = (runId: string) => {
    const updated = runs.map((r) => {
      if (r.id === runId) {
        return {
          ...r,
          status: 'RELEASED' as const,
          releasedAt: new Date().toISOString(),
        };
      }
      return r;
    });
    setRuns(updated);
    setSelectedRun(updated.find((r) => r.id === runId) || null);
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_RUNS, updated);
    showToast('Bank transfer advice generated and payslips released to employee portals.');
  };

  // Convert line item to full payslip modal data
  const handleOpenPayslipForLineItem = (item: EditablePayrollLineItem) => {
    const basicAmount =
      item.earnings?.find((e) => e.code === 'BASIC')?.amount || Math.round(item.grossAmount * 0.5);
    const hraAmount =
      item.earnings?.find((e) => e.code === 'HRA')?.amount || Math.round(basicAmount * 0.4);
    const epfAmount =
      item.deductions?.find((d) => d.code === 'EPF_EMP')?.amount ||
      Math.min(1800, Math.round(basicAmount * 0.12));
    const ptAmount = item.deductions?.find((d) => d.code === 'PT')?.amount || 200;

    const payslip: PayslipData = {
      id: item.id,
      payrollRunCode: selectedRun?.code || 'PR-2026-07',
      periodStart: selectedRun?.periodStart || '2026-07-01',
      periodEnd: selectedRun?.periodEnd || '2026-07-31',
      payDate: selectedRun?.payDate || '2026-07-31',
      employeeId: item.employeeId,
      employeeNumber: item.employeeNumber,
      employeeName: item.employeeName,
      jobTitle: item.jobTitle,
      department: item.department,
      branchName: 'HQ – Bengaluru',
      totalWorkingDays: 30,
      paidDays: item.regularDays + (item.paidLeaves || 0),
      lossOfPayDays: item.lossOfPayDays || 0,
      earnings:
        item.earnings && item.earnings.length > 0
          ? item.earnings.map((e) => ({ name: e.name, amount: e.amount }))
          : [
              { name: 'Basic Salary', amount: basicAmount },
              { name: 'House Rent Allowance (HRA)', amount: hraAmount },
              {
                name: 'Special Allowance',
                amount: Math.max(0, item.grossAmount - basicAmount - hraAmount),
              },
            ],
      deductions:
        item.deductions && item.deductions.length > 0
          ? item.deductions.map((d) => ({ name: d.name, amount: d.amount }))
          : [
              { name: 'Employee Provident Fund (12%)', amount: epfAmount },
              { name: 'Professional Tax (PT)', amount: ptAmount },
            ],
      employerContributions: [
        { name: 'Employer EPF Contribution', amount: epfAmount },
        { name: 'Gratuity Provision (4.81%)', amount: Math.round((basicAmount * 15) / (26 * 12)) },
      ],
      grossEarnings: item.grossAmount,
      totalDeductions: item.deductionAmount,
      netPay: item.netAmount,
      totalEmployerCost: item.grossAmount + epfAmount + Math.round((basicAmount * 15) / (26 * 12)),
    };
    setActivePayslipModalData(payslip);
  };

  const handleSaveLineItem = (updated: EditablePayrollLineItem) => {
    const next = lineItems.map((li) => (li.id === updated.id ? updated : li));
    setLineItems(next);
    emsStorageAdapter.setItem(STORAGE_KEY_PAYROLL_ITEMS, next);
    setEditingLineItem(null);
    showToast(`Updated payroll entry for ${updated.employeeName}.`);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global Module Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Payroll & Compensation Governance
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage payroll run lifecycles, salary structures, statutory compliance, and workforce
            compensation records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeMainTab === 'RUNS' && (
            <Button
              onClick={() => setIsStartRunModalOpen(true)}
              size="sm"
              className="h-8 text-xs font-semibold"
            >
              <span>+</span>
              <span>New Payroll Run</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4-Pillar Main Tabs */}
      <Tabs value={activeMainTab} onValueChange={(v: any) => setActiveMainTab(v)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-xl bg-slate-100 dark:bg-[#161B22] p-0.5 rounded-lg">
          <TabsTrigger value="RUNS" className="text-xs font-semibold py-1.5">
            1. Payroll Runs
          </TabsTrigger>
          <TabsTrigger value="COMPENSATION" className="text-xs font-semibold py-1.5">
            2. Compensation
          </TabsTrigger>
          <TabsTrigger value="STATUTORY" className="text-xs font-semibold py-1.5">
            3. Statutory Rules
          </TabsTrigger>
          <TabsTrigger value="EMPLOYEE_PAY" className="text-xs font-semibold py-1.5">
            4. Employee Pay
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════════
            PILLAR 1: PAYROLL RUNS LIFECYCLE (CLEAN ENTERPRISE COCKPIT)
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="RUNS" className="space-y-4 mt-3">
          {/* Executive Active Cycle Card */}
          {selectedRun && (
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#12161D] shadow-sm overflow-hidden">
              {/* Header: Cycle Details, Stepper, Primary Action */}
              <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-gradient-to-r from-slate-50/70 via-white to-sky-50/20 dark:from-[#151B26] dark:via-[#12161D] dark:to-[#151B26]">
                {/* Left: Cycle Identity */}
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#0284C7] to-sky-700 text-white font-bold flex items-center justify-center text-lg shrink-0 shadow-md shadow-sky-600/20 ring-4 ring-sky-50 dark:ring-sky-950/40">
                    ₹
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                        Payroll Cycle {selectedRun.code}
                      </span>
                      <Badge
                        variant={
                          selectedRun.status === 'RELEASED'
                            ? 'success'
                            : selectedRun.status === 'APPROVED'
                              ? 'sky'
                              : selectedRun.status === 'CALCULATED'
                                ? 'warning'
                                : 'secondary'
                        }
                        className="text-[10px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded-full"
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                        {selectedRun.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        Period:{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {formatDateRange(selectedRun.periodStart, selectedRun.periodEnd)}
                        </strong>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span>
                        Pay Date:{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {selectedRun.payDate}
                        </strong>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-[11px] text-slate-400">Monthly Run</span>
                    </p>
                  </div>
                </div>

                {/* Center: Interactive Lifecycle Stepper */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#161D27] px-4 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs self-start xl:self-auto">
                  {[
                    { label: '1. Sync Attendance', done: true, icon: '✓' },
                    {
                      label: '2. Compute',
                      done: selectedRun.status !== 'DRAFT',
                      current: selectedRun.status === 'DRAFT',
                      icon: '⚙',
                    },
                    {
                      label: '3. Authorize',
                      done: selectedRun.status === 'APPROVED' || selectedRun.status === 'RELEASED',
                      current: selectedRun.status === 'CALCULATED',
                      icon: '🛡',
                    },
                    {
                      label: '4. Disburse',
                      done: selectedRun.status === 'RELEASED',
                      current: selectedRun.status === 'APPROVED',
                      icon: '💸',
                    },
                  ].map((s, idx) => (
                    <React.Fragment key={idx}>
                      <div
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
                          s.done
                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40'
                            : s.current
                              ? 'text-[#0284C7] dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 ring-1 ring-sky-300/60 dark:ring-sky-800'
                              : 'text-slate-400 dark:text-slate-600'
                        }`}
                      >
                        <span className="text-[11px]">{s.icon}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                        <span className="sm:hidden">{s.label.split(' ')[1] || s.label}</span>
                      </div>
                      {idx < 3 && (
                        <span className="text-slate-300 dark:text-slate-700 text-xs">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Right: Primary Action Button */}
                <div className="flex items-center gap-2.5 self-start xl:self-auto">
                  {selectedRun.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      onClick={() => handleCalculatePayroll(selectedRun.id)}
                      className="bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs h-9 px-4 shadow-sm shadow-sky-600/20 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02]"
                    >
                      <span>▶</span>
                      <span>Compute Payroll Run</span>
                    </Button>
                  )}
                  {selectedRun.status === 'CALCULATED' && canApprove('PAYROLL') && (
                    <Button
                      size="sm"
                      onClick={() => handleAuthorizePayroll(selectedRun.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 shadow-sm shadow-emerald-600/20 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02]"
                    >
                      <span>✓</span>
                      <span>Authorize Run</span>
                    </Button>
                  )}
                  {selectedRun.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      onClick={() => handleDisbursePayroll(selectedRun.id)}
                      className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-semibold text-xs h-9 px-4 shadow-sm rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02]"
                    >
                      <span>💸</span>
                      <span>Disburse to Bank</span>
                    </Button>
                  )}
                  {selectedRun.status === 'RELEASED' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Disbursed & Closed
                    </span>
                  )}
                </div>
              </div>

              {/* 4 Clean Metric Stat Tiles */}
              <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/40 dark:bg-[#0F141C]/60">
                {/* Stat 1: Headcount */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Headcount
                    </span>
                    <span className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-sky-400 text-xs">
                      👥
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {selectedRun.employeeCount} Staff
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      100% Attendance Synced
                    </span>
                  </div>
                </div>

                {/* Stat 2: Gross Earnings */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Gross Earnings
                    </span>
                    <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 text-xs">
                      💼
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatINR(selectedRun.grossTotal || 3120000)}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                      Base Salary + Allowances
                    </span>
                  </div>
                </div>

                {/* Stat 3: Statutory Deductions */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Statutory Deductions
                    </span>
                    <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs">
                      📉
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
                      -{formatINR(selectedRun.deductionsTotal || 436800)}
                    </div>
                    <span className="text-[11px] text-rose-500/80 dark:text-rose-400/80 mt-1 block">
                      EPF (12%), PT & TDS Withheld
                    </span>
                  </div>
                </div>

                {/* Stat 4: Net Payable */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 dark:from-[#11221B] dark:via-[#161D27] dark:to-[#11221B] border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                      Net Payable
                    </span>
                    <span className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      🏦
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
                      {formatINR(selectedRun.netTotal || 2683200)}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700/90 dark:text-emerald-400 mt-1">
                      <span>⚡</span> Direct Bank Transfer Advice
                    </span>
                  </div>
                </div>
              </div>

              {/* Pre-Flight Health & Validation Checklist Strip */}
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#12161D] text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 font-semibold text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />4 of 5 automated
                    validations passed
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium text-[11px]">
                    <span>⚠️</span>
                    <span>3 staff missing PAN (Higher TDS alert)</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsVerificationModalOpen(true)}
                  className="text-xs text-[#0284C7] dark:text-sky-400 border-sky-200 dark:border-sky-800/60 hover:bg-sky-50 dark:hover:bg-sky-950/50 font-semibold h-7 px-3 shrink-0 rounded-lg"
                >
                  View Validation Checklist →
                </Button>
              </div>
            </div>
          )}

          {/* Itemized Employee Payroll Table */}
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">Staff Payroll Register</CardTitle>
                <CardDescription className="mt-0.5">
                  Itemized attendance, gross earnings, statutory deductions, and net payable
                  compensation.
                </CardDescription>
              </div>
              <Badge variant="secondary">{lineItems.length} records</Badge>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Employee</TableHead>
                  <TableHead>Paid Days</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Take-Home</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => {
                  const paidDaysCount = item.regularDays + (item.paidLeaves || 0);

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.employeeName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {item.employeeNumber} · {item.jobTitle}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="font-bold">{paidDaysCount}</span>
                        <span className="text-slate-400 text-[11px]"> / 30</span>
                        {item.lossOfPayDays > 0 && (
                          <span className="text-rose-500 text-[10px] block">
                            ({item.lossOfPayDays} LOP)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {formatINR(item.grossAmount)}
                      </TableCell>
                      <TableCell className="font-mono text-rose-600 dark:text-rose-400">
                        -{formatINR(item.deductionAmount)}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {formatINR(item.netAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPayslipForLineItem(item)}
                            className="text-xs"
                          >
                            👁 Payslip
                          </Button>
                          {selectedRun?.status !== 'RELEASED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingLineItem(item)}
                              className="text-xs"
                            >
                              Adjust
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            PILLAR 2: COMPENSATION & SALARY STRUCTURES
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="COMPENSATION" className="space-y-4 mt-3">
          <PayrollStructureBuilder />
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            PILLAR 3: STATUTORY COMPLIANCE & RULES ENGINE
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="STATUTORY" className="space-y-4 mt-3">
          <ScreenPayrollLegalConfig />
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            PILLAR 4: EMPLOYEE PAY & DOCUMENTS
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="EMPLOYEE_PAY" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">
                  Workforce Compensation & Document Vault
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Individual employee pay records, statutory tax identifiers, and official payslip
                  statements.
                </CardDescription>
              </div>
              <Badge variant="secondary">{lineItems.length} active employees</Badge>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Employee</TableHead>
                  <TableHead>PAN / UAN</TableHead>
                  <TableHead>Tax Regime</TableHead>
                  <TableHead>Net Take-Home</TableHead>
                  <TableHead className="text-right">Available Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {item.employeeName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {item.employeeNumber} · {item.department}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      <div>PAN: AAAPM0192L</div>
                      <div className="text-[10px] text-slate-400">UAN: 101928374650</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">New Regime (115BAC)</Badge>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(item.netAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPayslipForLineItem(item)}
                          className="text-xs"
                        >
                          📄 View Payslip
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Start New Payroll Run Dialog */}
      {isStartRunModalOpen && (
        <Dialog open={isStartRunModalOpen} onOpenChange={setIsStartRunModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Initialize New Payroll Run</DialogTitle>
              <DialogDescription>
                Select the pay period to aggregate biometric attendance, approved leaves, and role
                salary templates.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleStartNewRun} className="space-y-3.5 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Month</Label>
                  <Select
                    value={newPeriodMonth}
                    onChange={(e) => setNewPeriodMonth(e.target.value)}
                  >
                    <option value="07">July</option>
                    <option value="08">August</option>
                    <option value="09">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Year</Label>
                  <Select value={newPeriodYear} onChange={(e) => setNewPeriodYear(e.target.value)}>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </Select>
                </div>
              </div>

              <div className="p-3 bg-sky-50 dark:bg-[#152438] rounded-lg border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-300">
                <span>
                  The system will automatically run pre-run verification on 42 active workforce
                  members.
                </span>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStartRunModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Draft Run</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Line Item Adjust Modal */}
      {editingLineItem && (
        <EditPayrollLineItemModal
          isOpen={Boolean(editingLineItem)}
          onClose={() => setEditingLineItem(null)}
          item={editingLineItem}
          onSave={handleSaveLineItem}
        />
      )}

      {/* Verification Checklist Inspection Dialog */}
      {isVerificationModalOpen && (
        <Dialog open={isVerificationModalOpen} onOpenChange={setIsVerificationModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <DialogTitle>Pre-Flight Payroll Integrity Checklist</DialogTitle>
              </div>
              <DialogDescription>
                Automated compliance and data reconciliation checks for cycle {selectedRun?.code}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#161B22] rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Attendance & Timesheets Synchronized
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Biometric punch records and project timesheets reconciled for 24 staff.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Leave Balances & Loss of Pay (LOP)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      0 unpaid absence days detected across active departments.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Role Salary Formulas & Grade Structures
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Basic, HRA, and statutory ceilings resolved without formula errors.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-900/40">
                  <span className="font-bold">⚠️</span>
                  <div>
                    <div className="font-semibold text-amber-900 dark:text-amber-300">
                      3 Staff Missing PAN (Non-blocking Warning)
                    </div>
                    <div className="text-[11px] text-amber-800 dark:text-amber-400">
                      Higher TDS rate (20%) under Section 206AA will apply if PAN is not submitted
                      before payout.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setIsVerificationModalOpen(false)} size="sm">
                Close Checklist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Official Real-World Payslip Modal */}
      {activePayslipModalData && (
        <PayslipDocumentModal
          isOpen={Boolean(activePayslipModalData)}
          onClose={() => setActivePayslipModalData(null)}
          payslip={activePayslipModalData}
        />
      )}
    </div>
  );
}
