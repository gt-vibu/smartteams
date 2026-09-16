'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';
import { Check, Info, Save } from 'lucide-react';
import type { CompensationState } from '../../hooks/use-compensation';

interface CompensationSummaryCardProps {
  compensation: CompensationState;
  profile: SalaryProfile;
  pfEnabled: boolean;
  ptEnabled: boolean;
  esiEnabled: boolean;
  onTogglePf: () => void;
  onTogglePt: () => void;
  onToggleEsi: () => void;
}

export function CompensationSummaryCard({
  compensation,
  profile,
  pfEnabled,
  ptEnabled,
  esiEnabled,
  onTogglePf,
  onTogglePt,
  onToggleEsi,
}: CompensationSummaryCardProps) {
  const { salaryBreakdown, structure, employeePolicy } = profile;

  const monthlyGross = salaryBreakdown.gross;
  const monthlyEmployerBenefits = salaryBreakdown.totalEmployerBenefits;
  const monthlyDeductions = salaryBreakdown.totalDeductions;
  const monthlyNetPay = salaryBreakdown.netPay;

  const monthlyCtc = monthlyGross + monthlyEmployerBenefits;
  const annualCtc = monthlyCtc * 12;

  // Distribution calculations
  const baseAmount = structure.base;
  const hraAmount = structure.hra;
  const allowanceAmount = Math.max(0, monthlyGross - baseAmount - hraAmount);

  const basePct = monthlyCtc > 0 ? (baseAmount / monthlyCtc) * 100 : 0;
  const hraPct = monthlyCtc > 0 ? (hraAmount / monthlyCtc) * 100 : 0;
  const allowPct = monthlyCtc > 0 ? (allowanceAmount / monthlyCtc) * 100 : 0;
  const employerPct = Math.max(0, 100 - basePct - hraPct - allowPct);

  // SVG Donut Chart parameters
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffsetBase = 0;
  const strokeDashoffsetHra = -(basePct / 100) * circumference;
  const strokeDashoffsetAllow = -((basePct + hraPct) / 100) * circumference;
  const strokeDashoffsetEmployer = -((basePct + hraPct + allowPct) / 100) * circumference;

  return (
    <div className="w-full min-w-0 space-y-3.5">
      {/* 1. Payroll Policy & Statutory Applicability Card */}
      <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-border/70 pb-2">
          <h4 className="text-xs font-bold text-foreground">
            Payroll Policy & Statutory Applicability
          </h4>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Jurisdiction</span>
          <span className="font-semibold text-foreground">
            {employeePolicy?.statutoryJurisdiction ?? 'Standard (India)'}
          </span>
        </div>

        {/* Scheme Coverage Toggles */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={compensation.saving || !compensation.can.saveSalary}
            onClick={onTogglePf}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
              pfEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {pfEnabled && <Check className="h-3 w-3" />}
            PF {pfEnabled ? 'Covered' : 'Exempt'}
          </button>

          <button
            type="button"
            disabled={compensation.saving || !compensation.can.saveSalary}
            onClick={onTogglePt}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
              ptEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {ptEnabled && <Check className="h-3 w-3" />}
            PT {ptEnabled ? 'Covered' : 'Exempt'}
          </button>

          <button
            type="button"
            disabled={compensation.saving || !compensation.can.saveSalary}
            onClick={onToggleEsi}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
              esiEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {esiEnabled && <Check className="h-3 w-3" />}
            ESI {esiEnabled ? 'Covered' : 'Exempt'}
          </button>
        </div>

        {/* Explainability / Statutory Basis Details */}
        <div className="mt-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[10px] text-muted-foreground">
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-foreground">PF (EPFO):</span>
            <span className="text-right">
              {pfEnabled ? '12% of Basic (statutory ceiling ₹15,000)' : 'Exempt by employee policy'}
            </span>
          </div>
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-foreground">PT (State):</span>
            <span className="text-right">
              {ptEnabled
                ? monthlyGross >= 25000
                  ? '₹200/mo (₹300 in Feb; Karnataka slab ≥ ₹25,000)'
                  : 'Nil (Karnataka slab < ₹25,000)'
                : 'Exempt by employee policy'}
            </span>
          </div>
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-foreground">ESI (ESIC):</span>
            <span className="text-right">
              {!esiEnabled
                ? 'Exempt by policy'
                : monthlyGross > 21000
                  ? 'Exempt (Gross > ₹21,000 threshold)'
                  : 'Covered (0.75% emp / 3.25% empr)'}
            </span>
          </div>
          <div className="flex items-start justify-between gap-1 border-t border-border/50 pt-1 text-[9px] text-muted-foreground/80">
            <span className="font-semibold">Income Tax / TDS:</span>
            <span>Not calculated by Smarteam</span>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground leading-tight">
          Statutory rates and thresholds apply according to jurisdiction rules. Applicability is
          determined by policy and employee configuration.
        </p>
      </div>

      {/* 2. CTC Component Distribution Card (with Circular Donut chart) */}
      <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          CTC Component Distribution
        </h4>

        <div className="mt-3 flex items-center gap-3">
          {/* Circular Donut Visual */}
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-muted/30 stroke-current"
                strokeWidth="12"
                fill="transparent"
              />
              {/* Base */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-blue-500 stroke-current transition-all"
                strokeWidth="12"
                strokeDasharray={`${(basePct / 100) * circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffsetBase}
                fill="transparent"
              />
              {/* HRA */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-indigo-500 stroke-current transition-all"
                strokeWidth="12"
                strokeDasharray={`${(hraPct / 100) * circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffsetHra}
                fill="transparent"
              />
              {/* Allowances */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-amber-500 stroke-current transition-all"
                strokeWidth="12"
                strokeDasharray={`${(allowPct / 100) * circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffsetAllow}
                fill="transparent"
              />
              {/* Employer Contributions */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-emerald-500 stroke-current transition-all"
                strokeWidth="12"
                strokeDasharray={`${(employerPct / 100) * circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffsetEmployer}
                fill="transparent"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-[10px] font-bold text-foreground">
                {formatMoney(annualCtc)}
              </span>
              <span className="text-[8px] text-muted-foreground uppercase">CTC / year</span>
            </div>
          </div>

          {/* Legend */}
          <div className="min-w-0 flex-1 space-y-1 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-blue-500 shrink-0" />
                Basic ({basePct.toFixed(1)}%)
              </span>
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(baseAmount * 12)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-indigo-500 shrink-0" />
                HRA ({hraPct.toFixed(1)}%)
              </span>
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(hraAmount * 12)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-amber-500 shrink-0" />
                Allowances ({allowPct.toFixed(1)}%)
              </span>
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(allowanceAmount * 12)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-emerald-500 shrink-0" />
                Employer ({employerPct.toFixed(1)}%)
              </span>
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(monthlyEmployerBenefits * 12)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Compensation Summary Card */}
      <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
        <div className="border-b border-border/70 bg-muted/20 px-3.5 py-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Compensation Summary
          </h4>
        </div>

        <div className="divide-y divide-border/60 text-xs">
          <div className="flex items-center justify-between px-3.5 py-2 bg-muted/10 font-bold">
            <span className="text-muted-foreground">Component</span>
            <div className="flex items-center gap-4 text-right">
              <span className="text-[10px] uppercase text-muted-foreground w-16">Monthly (₹)</span>
              <span className="text-[10px] uppercase text-muted-foreground w-18">Annual (₹)</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2 text-[11px]">
            <span className="text-foreground">Total Earnings (Gross)</span>
            <div className="flex items-center gap-4 text-right font-mono font-semibold">
              <span className="w-16 text-foreground">{formatMoney(monthlyGross)}</span>
              <span className="w-18 text-foreground">{formatMoney(monthlyGross * 12)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2 text-[11px]">
            <span className="text-muted-foreground">Employee Deductions</span>
            <div className="flex items-center gap-4 text-right font-mono font-semibold text-destructive">
              <span className="w-16">-{formatMoney(monthlyDeductions)}</span>
              <span className="w-18">-{formatMoney(monthlyDeductions * 12)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2 text-[11px] bg-emerald-500/5">
            <span className="font-bold text-foreground">Net Take-Home Pay</span>
            <div className="flex items-center gap-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
              <span className="w-16">{formatMoney(monthlyNetPay)}</span>
              <span className="w-18">{formatMoney(monthlyNetPay * 12)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2 text-[11px]">
            <span className="text-muted-foreground">Employer Contributions</span>
            <div className="flex items-center gap-4 text-right font-mono font-semibold text-primary">
              <span className="w-16">+{formatMoney(monthlyEmployerBenefits)}</span>
              <span className="w-18">+{formatMoney(monthlyEmployerBenefits * 12)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2.5 text-[11px] bg-primary/5 font-bold">
            <span className="text-foreground">Total CTC (Company Cost)</span>
            <div className="flex items-center gap-4 text-right font-mono text-primary font-bold">
              <span className="w-16">{formatMoney(monthlyCtc)}</span>
              <span className="w-18">{formatMoney(annualCtc)}</span>
            </div>
          </div>
        </div>

        {/* Action & Note */}
        <div className="p-3.5 border-t border-border/70 space-y-2.5">
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-tight">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Saving creates a new effective compensation record and marks unreleased payroll runs
              as stale.
            </span>
          </div>

          {compensation.can.saveSalary && (
            <Button
              form="compensation-salary-form"
              disabled={compensation.saving}
              size="sm"
              type="submit"
              className="w-full gap-1.5 text-xs font-semibold h-8"
            >
              <Save className="h-3.5 w-3.5" />
              {compensation.saving ? 'Saving...' : 'Save Compensation'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
