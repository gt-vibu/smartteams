'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@smarteam/ui';
import { Sliders, Sparkles, Calculator, Check } from 'lucide-react';
import { formatMoney } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';

interface ConfigureSalaryPolicyDialogProps {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESETS = [
  { label: 'Standard (50% / 40%)', base: 50, hra: 40 },
  { label: 'Metro (50% / 50%)', base: 50, hra: 50 },
  { label: 'High Base (60% / 40%)', base: 60, hra: 40 },
  { label: 'Flexi (40% / 40%)', base: 40, hra: 40 },
];

export function ConfigureSalaryPolicyDialog({
  compensation,
  open,
  onOpenChange,
}: ConfigureSalaryPolicyDialogProps) {
  const currentPolicy = compensation.profile?.organizationPolicy;
  const sampleGross = Number(compensation.profile?.salaryBreakdown.gross ?? 50000);

  const [basePct, setBasePct] = useState<string>('50');
  const [hraPct, setHraPct] = useState<string>('40');
  const [baseMin, setBaseMin] = useState<string>('15000');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');

  useEffect(() => {
    if (open) {
      if (currentPolicy) {
        setBasePct(String(currentPolicy.basePercentage));
        setHraPct(String(currentPolicy.hraPercentage));
        setBaseMin(String(currentPolicy.baseMinimum));
      }
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
    }
  }, [open, currentPolicy]);

  const numBasePct = Number(basePct) || 0;
  const numHraPct = Number(hraPct) || 0;
  const numBaseMin = Number(baseMin) || 0;

  // Live calculation preview
  const preview = useMemo(() => {
    const gross = sampleGross > 0 ? sampleGross : 50000;
    const baseRaw = (gross * numBasePct) / 100;
    const base = Math.min(gross, Math.max(baseRaw, numBaseMin));
    const hraRaw = (base * numHraPct) / 100;
    const hra = Math.min(hraRaw, Math.max(0, gross - base));
    const otherAllowance = Math.max(0, gross - base - hra);
    return { gross, base, hra, otherAllowance };
  }, [sampleGross, numBasePct, numHraPct, numBaseMin]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const basePercentage = Number(basePct);
    const hraPercentage = Number(hraPct);
    const baseMinimum = Number(baseMin);

    if (
      !Number.isFinite(basePercentage) ||
      basePercentage <= 0 ||
      basePercentage > 100 ||
      !Number.isFinite(hraPercentage) ||
      hraPercentage < 0 ||
      hraPercentage > 100 ||
      !effectiveFrom
    ) {
      return;
    }

    await compensation.savePolicy({
      effectiveFrom,
      basePercentage,
      hraPercentage,
      baseMinimum,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold">
                Configure Salary Structure Policy
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Set organization-wide percentage rules for Basic Salary, HRA and allowances.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Presets */}
        <div className="pt-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Quick Policy Presets
          </Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PRESETS.map((preset) => {
              const isSelected = numBasePct === preset.base && numHraPct === preset.hra;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setBasePct(String(preset.base));
                    setHraPct(String(preset.hra));
                  }}
                  className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 font-bold text-primary shadow-2xs'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <span className="text-[11px] font-semibold">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3.5 py-1">
          {/* Base Salary % */}
          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="policy-base-pct" className="text-xs font-bold text-foreground">
                Base Salary (% of Gross)
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id="policy-base-pct"
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={basePct}
                  onChange={(e) => setBasePct(e.target.value)}
                  className="h-7 w-16 text-center font-mono font-bold text-xs"
                  required
                />
                <span className="text-xs font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="1"
              value={numBasePct}
              onChange={(e) => setBasePct(e.target.value)}
              className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>10% (Low Base)</span>
              <span>50% (Standard Statutory Base)</span>
              <span>90% (High Base)</span>
            </div>
          </div>

          {/* HRA % */}
          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="policy-hra-pct" className="text-xs font-bold text-foreground">
                House Rent Allowance (HRA % of Basic)
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id="policy-hra-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={hraPct}
                  onChange={(e) => setHraPct(e.target.value)}
                  className="h-7 w-16 text-center font-mono font-bold text-xs"
                  required
                />
                <span className="text-xs font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={numHraPct}
              onChange={(e) => setHraPct(e.target.value)}
              className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0% (No HRA)</span>
              <span>40% (Non-Metro)</span>
              <span>50% (Metro)</span>
            </div>
          </div>

          {/* Live Calculated Breakdown Preview */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Calculator className="h-3.5 w-3.5 text-primary" />
                <span>Live Breakdown Preview</span>
              </div>
              <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                Monthly Gross: {formatMoney(preview.gross)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-3 sm:gap-2 sm:text-center">
              <div className="flex items-baseline justify-between gap-3 rounded border border-border/60 bg-card/80 px-2.5 py-1.5 sm:block sm:p-1.5">
                <span className="block text-[10px] text-muted-foreground font-medium">
                  Base ({numBasePct}%)
                </span>
                <span className="block font-mono text-xs font-bold text-foreground sm:mt-0.5">
                  {formatMoney(preview.base)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded border border-border/60 bg-card/80 px-2.5 py-1.5 sm:block sm:p-1.5">
                <span className="block text-[10px] text-muted-foreground font-medium">
                  HRA ({numHraPct}% of Base)
                </span>
                <span className="block font-mono text-xs font-bold text-foreground sm:mt-0.5">
                  {formatMoney(preview.hra)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded border border-border/60 bg-card/80 px-2.5 py-1.5 sm:block sm:p-1.5">
                <span className="block text-[10px] text-muted-foreground font-medium">
                  Other Allowance
                </span>
                <span className="block font-mono text-xs font-bold text-foreground sm:mt-0.5">
                  {formatMoney(preview.otherAllowance)}
                </span>
              </div>
            </div>
          </div>

          {/* Base Minimum Floor & Effective Date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="policy-base-min" className="text-xs font-semibold mb-1 block">
                Base Minimum Floor (₹)
              </Label>
              <div className="relative">
                <Input
                  id="policy-base-min"
                  type="number"
                  min="0"
                  step="500"
                  value={baseMin}
                  onChange={(e) => setBaseMin(e.target.value)}
                  className="h-8 pl-7 font-mono text-xs"
                  placeholder="15000"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  ₹
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="policy-effective-from" className="text-xs font-semibold mb-1 block">
                Effective From
              </Label>
              <DatePicker
                id="policy-effective-from"
                value={effectiveFrom}
                onChange={setEffectiveFrom}
                className="h-8 w-full text-xs"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[10px] text-muted-foreground flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Saving updates the organization salary policy. All employee Base, HRA, and Other
              Allowance breakdowns recalculate automatically based on this policy.
            </span>
          </div>

          {compensation.saveError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {compensation.saveError}
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={compensation.saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={compensation.saving}
              className="font-semibold gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              {compensation.saving ? 'Saving...' : 'Update Policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
