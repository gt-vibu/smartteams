'use client';

import React, { useState, useMemo } from 'react';
import payrollFixture from '../../data/fixtures/payroll.json';
import { useAuth } from '../../hooks/use-auth';
import { ScreenPayrollView } from './screen-payroll-view';
import type { PayslipData } from './payslip-document-modal';
import type { SalaryStructureDocumentData } from './salary-structure-document-modal';

export interface AdvanceItem {
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

export interface PayrollEarning {
  name: string;
  code: string;
  monthly: number;
  annual?: number;
}

export interface PayslipSummary {
  id: string;
  month: string;
  period: string;
  paidDays: number;
  payableDays?: number;
  lossOfPayDays: number;
  lopDays?: number;
  grossPay: number;
  deductions: number;
  totalDeductions: number;
  netPay: number;
  payoutDate: string;
  disbursedAt?: string;
  paymentMode: string;
  status: string;
  basicSalary?: number;
  hra?: number;
  pfDeduction?: number;
  professionalTax?: number;
}

export interface PayrollCompensation {
  annualCtc: number;
  monthlyGross: number;
  netTakeHome: number;
  currency: string;
  currencySymbol: string;
  effectiveFrom?: string;
  earnings: PayrollEarning[];
}

export interface PayrollFixture {
  compensation: PayrollCompensation;
  payslips: PayslipSummary[];
  advances: AdvanceItem[];
}

const payrollData = payrollFixture as unknown as PayrollFixture;

export interface PayrollCalculation {
  gross: number;
  epf: number;
  pt: number;
  tds: number;
  totalDeductions: number;
  netTakeHome: number;
  annualCtc: number;
  employerPf: number;
  gratuity: number;
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
  const [advanceList, setAdvanceList] = useState<AdvanceItem[]>(payrollData.advances);

  const { compensation, payslips } = payrollData;

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

  const handleOpenPayslip = (slip: PayslipSummary) => {
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
      earnings: compensation.earnings.map((e) => ({
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
    <ScreenPayrollView
      persona={persona}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      compensation={compensation}
      payslips={payslips}
      advanceList={advanceList}
      dynamicCalc={dynamicCalc}
      handleDownloadStructureStatement={handleDownloadStructureStatement}
      handleOpenPayslip={handleOpenPayslip}
      isAdvanceModalOpen={isAdvanceModalOpen}
      setIsAdvanceModalOpen={setIsAdvanceModalOpen}
      advanceAmount={advanceAmount}
      setAdvanceAmount={setAdvanceAmount}
      advanceReason={advanceReason}
      setAdvanceReason={setAdvanceReason}
      handleRequestAdvance={handleRequestAdvance}
      selectedPayslipModal={selectedPayslipModal}
      setSelectedPayslipModal={setSelectedPayslipModal}
      selectedStructureModal={selectedStructureModal}
      setSelectedStructureModal={setSelectedStructureModal}
    />
  );
}
