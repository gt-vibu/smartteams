'use client';

import React, { useState, useMemo } from 'react';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import payrollFixture from '../../data/fixtures/payroll.json';
import { useAuth } from '../../hooks/use-auth';
import { PayslipDocumentModal, PayslipData } from './payslip-document-modal';
import {
  SalaryStructureDocumentModal,
  SalaryStructureDocumentData,
} from './salary-structure-document-modal';
import { formatINR } from '../../utils/formatters';

interface AdvanceItem {
  id: string;
  requestedAmount: number;
  approvedAmount: number | null;
  recoveredAmount: number;
  status: string;
  reason: string;
  requestedAt: string;
  approvedAt: string | null;
  recoveryMonth: string;
}

export function ScreenPayroll() {
  const { persona } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('structure');
  const [selectedPayslipModal, setSelectedPayslipModal] = useState<PayslipData | null>(null);
  const [selectedStructureModal, setSelectedStructureModal] =
    useState<SalaryStructureDocumentData | null>(null);

  // Salary Advance State
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceList, setAdvanceList] = useState<AdvanceItem[]>(
    payrollFixture.advances as unknown as AdvanceItem[],
  );

  const { compensation, payslips } = payrollFixture;

  // Standard statutory compliance calculations
  const dynamicCalc = useMemo(() => {
    const gross = compensation.monthlyGross;
    const epf = 1800;
    const pt = 200;
    const tds = Math.round(gross * 0.1);
    const totalDeductions = epf + pt + tds;
    const netTakeHome = gross - totalDeductions;
    const annualCtc = compensation.annualCtc;
    const employerPf = 1800;
    const gratuity = 2405;

    return {
      gross,
      epf,
      pt,
      tds,
      totalDeductions,
      netTakeHome,
      annualCtc,
      employerPf,
      gratuity,
    };
  }, [compensation]);

  const handleRequestAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (advanceAmount && advanceReason) {
      const newAdv: AdvanceItem = {
        id: `adv-${Date.now()}`,
        requestedAmount: Number(advanceAmount),
        approvedAmount: null,
        recoveredAmount: 0,
        status: 'REQUESTED',
        reason: advanceReason,
        requestedAt: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        approvedAt: null,
        recoveryMonth: 'Next Payroll Run',
      };
      setAdvanceList([newAdv, ...advanceList]);
      setAdvanceAmount('');
      setAdvanceReason('');
      setIsAdvanceModalOpen(false);
    }
  };

  const handleOpenPayslip = (slip: any) => {
    const basicAmount = slip.basicSalary || Math.round(slip.grossPay * 0.5);
    const hraAmount = slip.hra || Math.round(basicAmount * 0.4);
    const epfAmount = slip.pfDeduction || 1800;
    const ptAmount = slip.professionalTax || 200;
    const tdsAmount = Math.round(slip.grossPay * 0.1);
    const specialAllowanceAmount = Math.max(0, slip.grossPay - basicAmount - hraAmount);

    const fullPayslip: PayslipData = {
      id: slip.id,
      payrollRunCode: `PR-${slip.month.replace(' ', '-')}`,
      periodStart: `2026-07-01`,
      periodEnd: `2026-07-31`,
      payDate: slip.disbursedAt || '2026-07-31',
      employeeId: persona.employeeNumber || 'EMP-064',
      employeeNumber: persona.employeeNumber || 'EMP-064',
      employeeName: persona.name,
      jobTitle: persona.jobTitle,
      department: persona.department,
      branchName: persona.branchName || 'HQ – Bengaluru',
      totalWorkingDays: 30,
      paidDays: slip.payableDays || 30,
      lossOfPayDays: slip.lopDays || 0,
      earnings: [
        { name: 'Basic Salary', amount: basicAmount },
        { name: 'House Rent Allowance (HRA)', amount: hraAmount },
        { name: 'Special Allowance', amount: specialAllowanceAmount },
      ],
      deductions: [
        { name: 'Employee Provident Fund (12%)', amount: epfAmount },
        { name: 'Professional Tax (PT)', amount: ptAmount },
        { name: 'Income Tax (TDS 10%)', amount: tdsAmount },
      ],
      employerContributions: [
        { name: 'Employer EPF Contribution', amount: epfAmount },
        { name: 'Gratuity Provision (4.81%)', amount: Math.round((basicAmount * 15) / (26 * 12)) },
      ],
      grossEarnings: slip.grossPay,
      totalDeductions: epfAmount + ptAmount + tdsAmount,
      netPay: slip.grossPay - (epfAmount + ptAmount + tdsAmount),
      totalEmployerCost: slip.grossPay + epfAmount + Math.round((basicAmount * 15) / (26 * 12)),
    };

    setSelectedPayslipModal(fullPayslip);
  };

  const handleDownloadStructureStatement = () => {
    const docData: SalaryStructureDocumentData = {
      structureName: 'Software Engineering Standard Track',
      structureCode: 'ROLE_SOFTWARE_ENG',
      effectiveFrom: compensation.effectiveFrom || '2026-04-01',
      employeeName: persona.name,
      employeeNumber: persona.employeeNumber || 'EMP-064',
      jobTitle: persona.jobTitle,
      department: persona.department,
      annualCtc: dynamicCalc.annualCtc,
      monthlyCtc: Math.round(dynamicCalc.annualCtc / 12),
      earnings: compensation.earnings.map((e: any) => ({
        name: e.name,
        monthly: e.monthly,
        annual: e.annual || e.monthly * 12,
      })),
      deductions: [
        {
          name: 'Employee Provident Fund (12%)',
          monthly: dynamicCalc.epf,
          annual: dynamicCalc.epf * 12,
        },
        { name: 'Professional Tax (PT)', monthly: dynamicCalc.pt, annual: dynamicCalc.pt * 12 },
        { name: 'Income Tax (TDS 10%)', monthly: dynamicCalc.tds, annual: dynamicCalc.tds * 12 },
      ],
      employerContributions: [
        {
          name: 'Employer EPF Contribution',
          monthly: dynamicCalc.employerPf,
          annual: dynamicCalc.employerPf * 12,
        },
        {
          name: 'Gratuity Provision (4.81%)',
          monthly: dynamicCalc.gratuity,
          annual: dynamicCalc.gratuity * 12,
        },
      ],
      grossSalary: dynamicCalc.gross,
      totalDeductions: dynamicCalc.totalDeductions,
      netTakeHome: dynamicCalc.netTakeHome,
    };
    setSelectedStructureModal(docData);
  };

  return (
    <div className="space-y-6">
      {/* ── ZOHO-GRADE HERO SUMMARY BANNER ── */}
      <div className="bg-white dark:bg-[#161B22] rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Employee Identity */}
          <div className="flex items-start gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#0284C7] to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-xs shrink-0">
              {persona.avatarInitials || persona.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {persona.name}
                </h1>
                <Badge variant="sky" className="font-mono text-[10px]">
                  {persona.employeeNumber || 'EMP-064'}
                </Badge>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active Payroll
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {persona.jobTitle} · {persona.department} · {persona.branchName || 'Bengaluru HQ'}
              </p>
            </div>
          </div>

          {/* 4 Crisp Key Compensation Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 dark:bg-[#1B2028] p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Annual CTC
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                {formatINR(dynamicCalc.annualCtc)}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-[#1B2028] p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Monthly Gross
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                {formatINR(dynamicCalc.gross)}
              </span>
            </div>

            <div className="bg-rose-50/60 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-200/80 dark:border-rose-800/50 text-left">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                Deductions
              </span>
              <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5 block">
                -{formatINR(dynamicCalc.totalDeductions)}
              </span>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 text-left">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Take-Home
              </span>
              <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5 block">
                {formatINR(dynamicCalc.netTakeHome)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ZOHO-GRADE NAVIGATION TABS ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <TabsList className="bg-slate-100 dark:bg-[#161B22] p-1 rounded-lg">
            <TabsTrigger value="structure" className="text-xs font-semibold px-4 py-1.5">
              🏛 Salary Structure & Annexure
            </TabsTrigger>
            <TabsTrigger value="payslips" className="text-xs font-semibold px-4 py-1.5">
              📄 Payslips ({payslips.length})
            </TabsTrigger>
            <TabsTrigger value="advances" className="text-xs font-semibold px-4 py-1.5">
              💳 Salary Advances ({advanceList.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'structure' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadStructureStatement}
                className="text-xs"
              >
                <span>📥</span>
                <span>Download Structure (PDF)</span>
              </Button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: ZOHO-GRADE COMPENSATION STRUCTURE & ANNEXURE TABLE
           ══════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="structure" className="space-y-4 mt-4">
          {/* Statutory Compliance Status Strip (Locked & Governed by Company & State Rules) */}
          <div className="bg-slate-50 dark:bg-[#161B22] p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 text-[#0284C7] dark:text-sky-400 flex items-center justify-center shrink-0">
                <svg
                  className="h-4.5 w-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Mandatory Statutory Compliance
                  </span>
                  <Badge variant="secondary" className="text-[9px] font-mono">
                    Locked by Org Policy
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Statutory deductions are automatically derived from Karnataka PT rules, EPF
                  regulations, and your declared tax regime.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1B2028] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                PT: ₹200/mo (Karnataka)
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1B2028] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                TDS: 10% (New Regime)
              </span>
            </div>
          </div>

          {/* Structured Annexure Table */}
          <div className="bg-white dark:bg-[#1B2028] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50/80 dark:bg-[#161B22] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Software Engineering Standard Compensation Track
                </span>
                <span className="text-[11px] text-slate-500 ml-2 font-mono">
                  (Effective from {compensation.effectiveFrom})
                </span>
              </div>
              <Badge variant="sky" className="text-[10px]">
                CONFIDENTIAL ANNEXURE
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/75 dark:bg-[#12171F]">
                  <TableHead className="w-1/3 px-4 font-bold text-xs uppercase">
                    Salary Component
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase">Category</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Calculation Basis</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase">
                    Monthly (₹)
                  </TableHead>
                  <TableHead className="text-right px-4 font-bold text-xs uppercase">
                    Annual (₹)
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {/* ── SECTION 1: EARNINGS & ALLOWANCES ── */}
                <TableRow className="bg-slate-50/50 dark:bg-[#161B22]/50 font-bold">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-2 text-[11px] text-slate-900 dark:text-white uppercase tracking-wider"
                  >
                    1. Earnings & Allowances
                  </TableCell>
                </TableRow>

                {compensation.earnings.map((e: any, idx: number) => (
                  <TableRow key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <TableCell className="px-4 font-semibold text-slate-900 dark:text-white">
                      {e.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        Earning
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs font-mono">
                      {e.code === 'BASIC'
                        ? '50% of CTC'
                        : e.code === 'HRA'
                          ? '40% of Basic'
                          : 'Residual / Standard'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(e.monthly)}
                    </TableCell>
                    <TableCell className="text-right px-4 font-mono font-semibold">
                      {formatINR(e.annual || e.monthly * 12)}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Subtotal Gross */}
                <TableRow className="bg-sky-50/60 dark:bg-[#152438]/60 font-bold border-t border-sky-200 dark:border-sky-800/50">
                  <TableCell colSpan={3} className="px-4 text-sky-900 dark:text-sky-300 font-bold">
                    Total Gross Earnings (A):
                  </TableCell>
                  <TableCell className="text-right font-mono text-sky-800 dark:text-sky-300 font-bold">
                    {formatINR(dynamicCalc.gross)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-sky-800 dark:text-sky-300 font-bold">
                    {formatINR(dynamicCalc.gross * 12)}
                  </TableCell>
                </TableRow>

                {/* ── SECTION 2: EMPLOYEE DEDUCTIONS ── */}
                <TableRow className="bg-slate-50/50 dark:bg-[#161B22]/50 font-bold">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-2 text-[11px] text-rose-600 dark:text-rose-400 uppercase tracking-wider"
                  >
                    2. Employee Statutory Deductions
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <TableCell className="px-4 font-medium text-slate-800 dark:text-slate-200">
                    Employee Provident Fund (EPF)
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      Statutory
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs font-mono">
                    12% with ₹15,000 Wage Cap
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.epf)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.epf * 12)}
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <TableCell className="px-4 font-medium text-slate-800 dark:text-slate-200">
                    Professional Tax (PT)
                  </TableCell>
                  <TableCell>
                    <Badge variant="sky" className="text-[10px]">
                      State Tax
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs font-mono">
                    Karnataka Slabs (₹200 / mo)
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.pt)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.pt * 12)}
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <TableCell className="px-4 font-medium text-slate-800 dark:text-slate-200">
                    Income Tax (TDS Withholding)
                  </TableCell>
                  <TableCell>
                    <Badge variant="sky" className="text-[10px]">
                      Income Tax
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs font-mono">
                    Section 392(1) (10% of Gross)
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.tds)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-rose-600 dark:text-rose-400">
                    -{formatINR(dynamicCalc.tds * 12)}
                  </TableCell>
                </TableRow>

                {/* Subtotal Deductions */}
                <TableRow className="bg-rose-50/60 dark:bg-rose-950/30 font-bold border-t border-rose-200 dark:border-rose-900/50">
                  <TableCell
                    colSpan={3}
                    className="px-4 text-rose-800 dark:text-rose-300 font-bold"
                  >
                    Total Employee Deductions (B):
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-700 dark:text-rose-400 font-bold">
                    -{formatINR(dynamicCalc.totalDeductions)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-rose-700 dark:text-rose-400 font-bold">
                    -{formatINR(dynamicCalc.totalDeductions * 12)}
                  </TableCell>
                </TableRow>

                {/* ── SECTION 3: NET TAKE-HOME PAY (HIGHLIGHT) ── */}
                <TableRow className="bg-emerald-50 dark:bg-emerald-950/40 font-bold border-y-2 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200">
                  <TableCell colSpan={3} className="px-4 text-sm font-bold">
                    Net Take-Home Pay (A - B) Disbursed to Bank:
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {formatINR(dynamicCalc.netTakeHome)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {formatINR(dynamicCalc.netTakeHome * 12)}
                  </TableCell>
                </TableRow>

                {/* ── SECTION 4: EMPLOYER CTC CONTRIBUTIONS ── */}
                <TableRow className="bg-slate-50/50 dark:bg-[#161B22]/50 font-bold">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-400 uppercase tracking-wider"
                  >
                    3. Employer Statutory Contributions & Provisions (CTC)
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <TableCell className="px-4 font-medium text-slate-700 dark:text-slate-300">
                    Employer EPF Contribution
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      Employer
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs font-mono">
                    12% Matching Contribution
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-700 dark:text-slate-300">
                    {formatINR(dynamicCalc.employerPf)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-slate-700 dark:text-slate-300">
                    {formatINR(dynamicCalc.employerPf * 12)}
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <TableCell className="px-4 font-medium text-slate-700 dark:text-slate-300">
                    Gratuity Provision
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      Provision
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs font-mono">
                    4.81% of Basic Salary
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-700 dark:text-slate-300">
                    {formatINR(dynamicCalc.gratuity)}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono text-slate-700 dark:text-slate-300">
                    {formatINR(dynamicCalc.gratuity * 12)}
                  </TableCell>
                </TableRow>

                {/* Total Annual CTC */}
                <TableRow className="bg-slate-100 dark:bg-[#161B22] font-bold border-t border-slate-300 dark:border-slate-700">
                  <TableCell colSpan={3} className="px-4 font-bold text-slate-900 dark:text-white">
                    Total Cost to Company (CTC):
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatINR(Math.round(dynamicCalc.annualCtc / 12))}
                  </TableCell>
                  <TableCell className="text-right px-4 font-mono font-bold text-slate-900 dark:text-white">
                    {formatINR(dynamicCalc.annualCtc)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: ZOHO-GRADE PAYSLIPS LEDGER TABLE
           ══════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="payslips" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">Monthly Payslip Register</CardTitle>
                <CardDescription className="mt-0.5">
                  Official monthly statements authorized by Finance and disbursed directly to bank.
                </CardDescription>
              </div>
              <Badge variant="secondary">{payslips.length} Statements</Badge>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-[#12171F]">
                  <TableHead className="px-4">Month / Period</TableHead>
                  <TableHead>Payable Days</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Pay</TableHead>
                  <TableHead>Disbursement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right px-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((slip: any) => (
                  <TableRow
                    key={slip.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <TableCell className="px-4 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded bg-sky-50 dark:bg-sky-950/50 text-[#0284C7] dark:text-sky-300 font-bold text-xs flex items-center justify-center">
                          📅
                        </div>
                        <div>
                          <div>{slip.month}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {slip.period}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-emerald-600 font-semibold">{slip.paidDays} Days</span>
                      {slip.lossOfPayDays > 0 && (
                        <span className="text-rose-500 ml-1">({slip.lossOfPayDays} LOP)</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-slate-900 dark:text-white">
                      {formatINR(slip.grossPay)}
                    </TableCell>
                    <TableCell className="font-mono text-rose-600 dark:text-rose-400">
                      -{formatINR(slip.deductions)}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(slip.netPay)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <div>{slip.disbursedAt}</div>
                      <div className="text-[10px] text-slate-400">
                        {slip.paymentMode || 'Direct Bank Deposit'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {slip.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right px-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenPayslip(slip)}
                        className="text-xs"
                      >
                        📄 View Statement
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: SALARY ADVANCES
           ══════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="advances" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-bold">Salary Advance Requests</CardTitle>
                <CardDescription className="mt-0.5">
                  Request emergency salary advances recovered automatically across upcoming payroll
                  cycles.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setIsAdvanceModalOpen(true)}>
                + Request Advance
              </Button>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-[#12171F]">
                  <TableHead className="px-4">Requested Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Recovery Timeline</TableHead>
                  <TableHead className="text-right px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advanceList.map((adv) => (
                  <TableRow key={adv.id}>
                    <TableCell className="px-4 font-medium">{adv.requestedAt}</TableCell>
                    <TableCell className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatINR(adv.requestedAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {adv.reason}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{adv.recoveryMonth}</TableCell>
                    <TableCell className="text-right px-4">
                      <Badge variant={adv.status === 'APPROVED' ? 'success' : 'warning'}>
                        {adv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Advance Request Dialog */}
      {isAdvanceModalOpen && (
        <Dialog open={isAdvanceModalOpen} onOpenChange={setIsAdvanceModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Salary Advance</DialogTitle>
              <DialogDescription>
                Submit an advance request for HR and Finance approval.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRequestAdvance} className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Requested Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Reason for Advance</Label>
                <Textarea
                  placeholder="e.g. Medical emergency / household relocation expenses"
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdvanceModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Submit Request</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Official Real-World Payslip Modal */}
      {selectedPayslipModal && (
        <PayslipDocumentModal
          isOpen={Boolean(selectedPayslipModal)}
          onClose={() => setSelectedPayslipModal(null)}
          payslip={selectedPayslipModal}
        />
      )}

      {/* Official Salary Structure Statement Modal */}
      {selectedStructureModal && (
        <SalaryStructureDocumentModal
          isOpen={Boolean(selectedStructureModal)}
          onClose={() => setSelectedStructureModal(null)}
          data={selectedStructureModal}
        />
      )}
    </div>
  );
}
