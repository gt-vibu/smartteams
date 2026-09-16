'use client';

import React, { useState, useEffect } from 'react';
import { DatePicker, Input, Label } from '@smarteam/ui';
import { type SalaryProfile } from '@smarteam/contracts';
import { Sparkles } from 'lucide-react';
import type { CompensationState } from '../../hooks/use-compensation';

interface CompensationSalaryFormProps {
  compensation: CompensationState;
  profile: SalaryProfile;
  pfEnabled: boolean;
  ptEnabled: boolean;
  esiEnabled: boolean;
}

export function CompensationSalaryForm({
  compensation,
  profile,
  pfEnabled,
  ptEnabled,
  esiEnabled,
}: CompensationSalaryFormProps) {
  const current = profile.compensation;
  const policy = profile.employeePolicy;

  const [monthlyGrossInput, setMonthlyGrossInput] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');

  // Synchronize state when selected employee profile loads
  useEffect(() => {
    const gross = Number(current?.grossSalary ?? current?.baseAmount ?? 0);
    setMonthlyGrossInput(gross > 0 ? String(gross) : '');
    setEffectiveFrom(current?.effectiveFrom ? current.effectiveFrom.slice(0, 10) : '');
  }, [current]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const grossSalary = Number(monthlyGrossInput);
    if (!Number.isFinite(grossSalary) || grossSalary < 0 || !effectiveFrom) return;
    await compensation.saveSalary({
      grossSalary,
      overtimeMultiplier: Number(current?.overtimeMultiplier ?? 1.5),
      effectiveFrom,
      payrollEnabled: policy?.payrollEnabled ?? true,
      salarySlipMode: policy?.salarySlipMode ?? 'ENABLED',
      pfEnabled,
      esiEnabled,
      ptEnabled,
    });
  };

  return (
    <div className="w-full min-w-0 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold tracking-tight text-foreground uppercase">
              Compensation Configuration
            </h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-2.5 w-2.5" />
              Effective-Dated
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Monthly gross is the authoritative compensation basis. Annual CTC and breakdown are
            derived by the backend payroll engine.
          </p>
        </div>
      </div>

      <form id="compensation-salary-form" onSubmit={submit} className="mt-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Monthly Gross Input */}
          <div>
            <Label className="mb-1 block text-xs font-semibold" htmlFor="gross-salary">
              Monthly Gross Salary (₹)
            </Label>
            <div className="relative">
              <Input
                className="h-8 pl-7 font-mono font-bold text-xs"
                disabled={compensation.saving || !compensation.can.saveSalary}
                id="gross-salary"
                inputMode="decimal"
                onChange={(e) => setMonthlyGrossInput(e.target.value)}
                placeholder="e.g. 85000"
                type="number"
                value={monthlyGrossInput}
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                ₹
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              Authoritative base for earnings, deductions and statutory calculations.
            </p>
          </div>

          {/* Effective From Date */}
          <div>
            <Label className="mb-1 block text-xs font-semibold" htmlFor="salary-effective-from">
              Effective From
            </Label>
            <DatePicker
              className="h-8 w-full text-xs"
              disabled={compensation.saving || !compensation.can.saveSalary}
              id="salary-effective-from"
              onChange={setEffectiveFrom}
              value={effectiveFrom}
            />
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              Preserves historical compensation. Future periods take effect automatically.
            </p>
          </div>

          {/* Version Date / Readout */}
          <div className="hidden lg:block">
            <Label className="mb-1 block text-xs font-semibold">Version date</Label>
            <div className="flex h-8 items-center rounded-md border border-border bg-muted/30 px-3 font-mono text-xs text-muted-foreground">
              {effectiveFrom || 'Current'}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              Active compensation period version.
            </p>
          </div>
        </div>
      </form>

      {compensation.saveError && (
        <div
          className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {compensation.saveError}
        </div>
      )}
    </div>
  );
}
