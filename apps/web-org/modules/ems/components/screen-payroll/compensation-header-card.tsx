'use client';

import React from 'react';
import { Badge, Button } from '@smarteam/ui';
import { formatMoney, type Employee, type SalaryProfile } from '@smarteam/contracts';
import {
  Briefcase,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  Mail,
  Phone,
  Printer,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react';
import {
  downloadSalaryStructureCsv,
  openSalaryStructurePrintView,
} from './salary-structure-export';

interface CompensationHeaderCardProps {
  employee?: Employee | null;
  profile: SalaryProfile;
  orgName?: string;
}

export function CompensationHeaderCard({
  employee,
  profile,
  orgName,
}: CompensationHeaderCardProps) {
  const { salaryBreakdown, compensation } = profile;

  const handlePrint = () => {
    openSalaryStructurePrintView({ profile, employee, orgName });
  };

  const handleCsv = () => {
    downloadSalaryStructureCsv({ profile, employee, orgName });
  };

  // Monthly values from authoritative breakdown
  const monthlyGross = salaryBreakdown.gross;
  const monthlyEmployerBenefits = salaryBreakdown.totalEmployerBenefits;
  const monthlyNetPay = salaryBreakdown.netPay;

  // CTC calculations: Monthly CTC = Gross + Employer Benefits; Annual CTC = Monthly CTC * 12
  const monthlyCtc = monthlyGross + monthlyEmployerBenefits;
  const annualCtc = monthlyCtc * 12;

  const effectiveFrom = compensation?.effectiveFrom
    ? compensation.effectiveFrom.slice(0, 10)
    : 'Not configured';

  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`.trim()
    : 'Selected Employee';

  const initials = employee
    ? `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase()
    : 'EM';

  return (
    <div className="w-full min-w-0 space-y-3">
      {/* Top Employee Context Bar */}
      <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Employee Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm ring-1 ring-primary/20">
              {employee ? initials : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-bold tracking-tight text-foreground">
                  {employeeName}
                </h2>
                {employee?.status && (
                  <Badge
                    variant={employee.status === 'ACTIVE' ? 'outline' : 'secondary'}
                    className={`text-[9px] uppercase font-semibold px-1.5 py-0.2 ${
                      employee.status === 'ACTIVE'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : ''
                    }`}
                  >
                    {employee.status === 'ACTIVE' ? 'Active' : employee.status}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                {employee?.employeeNumber && <span>ID: {employee.employeeNumber}</span>}
                {employee?.employmentType && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-sans capitalize text-foreground/80">
                      {employee.employmentType.toLowerCase().replace(/_/g, ' ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Contact Details & Metadata */}
          <div className="hidden xl:flex items-center gap-4 text-[11px] text-muted-foreground">
            {employee?.workEmail && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="truncate max-w-[160px]">{employee.workEmail}</span>
              </div>
            )}
            {employee?.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span>{employee.phone}</span>
              </div>
            )}
            {employee?.employmentType && (
              <div className="flex items-center gap-1.5 capitalize">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span>{employee.employmentType.toLowerCase().replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>

          {/* Right: Effective Date & Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Effective from:</span>
              <span className="font-mono font-medium text-foreground text-[11px]">
                {effectiveFrom}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs font-medium gap-1.5 border-primary/30 text-primary hover:bg-primary/5 shadow-2xs"
              onClick={handlePrint}
              title="Download official Salary Annexure as PDF / Printable format"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleCsv}
              title="Export Salary Structure to CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>CSV</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 4 Headline Metric Cards (Annual CTC, Monthly CTC, Monthly Gross, Take-Home Pay) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {/* Annual CTC */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-3.5 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
            <span>Annual CTC</span>
            <TrendingUp className="h-3.5 w-3.5 text-primary/70" />
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
            {formatMoney(annualCtc)}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
            Cost to company / year
          </p>
        </div>

        {/* Monthly CTC */}
        <div className="rounded-xl border border-border/70 bg-card p-3 sm:p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Monthly CTC</span>
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-foreground truncate">
            {formatMoney(monthlyCtc)}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
            Gross + Employer benefits
          </p>
        </div>

        {/* Monthly Gross */}
        <div className="rounded-xl border border-border/70 bg-card p-3 sm:p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Monthly Gross</span>
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-foreground truncate">
            {formatMoney(monthlyGross)}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">Basic + Allowances</p>
        </div>

        {/* Estimated Net Pay */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <span>Net Take-Home (Est.)</span>
            <Wallet className="h-3.5 w-3.5 text-emerald-500/70" />
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-foreground truncate">
            {formatMoney(monthlyNetPay)}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
            After employee deductions
          </p>
        </div>
      </div>
    </div>
  );
}
