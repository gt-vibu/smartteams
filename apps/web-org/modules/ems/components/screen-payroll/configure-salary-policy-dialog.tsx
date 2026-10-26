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
import { useOrganization } from '../../hooks/use-organization';
import { localDateKey } from '../../lib/local-date';
import { INDIA_PAYROLL_JURISDICTIONS, PROFESSIONAL_TAX_PRESETS } from './statutory-rule-presets';

interface ConfigureSalaryPolicyDialogProps {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESETS = [
  { label: 'Standard (50% / 40%)', base: 50, hra: 40 },
  { label: 'Higher HRA (50% / 50%)', base: 50, hra: 50 },
  { label: 'High Base (60% / 40%)', base: 60, hra: 40 },
  { label: 'Flexi (40% / 40%)', base: 40, hra: 40 },
];

export function ConfigureSalaryPolicyDialog({
  compensation,
  open,
  onOpenChange,
}: ConfigureSalaryPolicyDialogProps) {
  const organization = useOrganization();
  const currentPolicy = compensation.organizationPolicy;
  const [basePct, setBasePct] = useState<string>('50');
  const [hraPct, setHraPct] = useState<string>('40');
  const [baseMin, setBaseMin] = useState<string>('15000');
  const [defaultGrossSalary, setDefaultGrossSalary] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [statutoryJurisdiction, setStatutoryJurisdiction] = useState('');
  const [pfDefault, setPfDefault] = useState(false);
  const [esiDefault, setEsiDefault] = useState(false);
  const [ptDefault, setPtDefault] = useState(false);
  const [salarySlipDefault, setSalarySlipDefault] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const primaryBranch = organization.branches.find(
    (branch) => branch.id === organization.primaryBranchId,
  );
  const address = primaryBranch?.address;
  const addressState =
    address && typeof address === 'object' && !Array.isArray(address) ? address.state : undefined;
  const primaryBranchState = typeof addressState === 'string' ? addressState.trim() : '';

  useEffect(() => {
    if (open) {
      if (currentPolicy) {
        setBasePct(String(currentPolicy.basePercentage));
        setHraPct(String(currentPolicy.hraPercentage));
        setBaseMin(String(currentPolicy.baseMinimum));
        setDefaultGrossSalary(
          currentPolicy.defaultGrossSalary == null ? '' : String(currentPolicy.defaultGrossSalary),
        );
        setStatutoryJurisdiction(currentPolicy.statutoryJurisdiction ?? primaryBranchState);
        setPfDefault(currentPolicy.pfDefault);
        setEsiDefault(currentPolicy.esiDefault);
        setPtDefault(currentPolicy.ptDefault);
        setSalarySlipDefault(currentPolicy.salarySlipDefault);
      } else {
        setBasePct('50');
        setHraPct('40');
        setBaseMin('15000');
        setDefaultGrossSalary('');
        setStatutoryJurisdiction(primaryBranchState);
        setPfDefault(false);
        setEsiDefault(false);
        setPtDefault(false);
        setSalarySlipDefault(true);
      }
      setEffectiveFrom(localDateKey());
      setValidationError(null);
    }
  }, [open, currentPolicy]);

  useEffect(() => {
    if (
      open &&
      !currentPolicy?.statutoryJurisdiction &&
      !statutoryJurisdiction &&
      primaryBranchState
    ) {
      setStatutoryJurisdiction(primaryBranchState.toUpperCase());
    }
  }, [open, currentPolicy?.statutoryJurisdiction, primaryBranchState, statutoryJurisdiction]);

  const numBasePct = Number(basePct) || 0;
  const numHraPct = Number(hraPct) || 0;
  const numBaseMin = Number(baseMin) || 0;
  const numDefaultGross = Number(defaultGrossSalary);

  // Live calculation preview
  const preview = useMemo(() => {
    const gross = Number.isFinite(numDefaultGross) && numDefaultGross > 0 ? numDefaultGross : 0;
    const baseRaw = (gross * numBasePct) / 100;
    const base = Math.min(gross, Math.max(baseRaw, numBaseMin));
    const hraRaw = (base * numHraPct) / 100;
    const hra = Math.min(hraRaw, Math.max(0, gross - base));
    const otherAllowance = Math.max(0, gross - base - hra);
    return { gross, base, hra, otherAllowance };
  }, [numDefaultGross, numBasePct, numHraPct, numBaseMin]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const basePercentage = Number(basePct);
    const hraPercentage = Number(hraPct);
    const baseMinimum = Number(baseMin);
    const parsedDefaultGross = defaultGrossSalary.trim() ? Number(defaultGrossSalary) : null;

    if (
      !Number.isFinite(basePercentage) ||
      basePercentage <= 0 ||
      basePercentage > 100 ||
      !Number.isFinite(hraPercentage) ||
      hraPercentage < 0 ||
      hraPercentage > 100 ||
      (parsedDefaultGross !== null &&
        (!Number.isFinite(parsedDefaultGross) || parsedDefaultGross <= 0)) ||
      !effectiveFrom
    ) {
      return;
    }

    if ((pfDefault || esiDefault || ptDefault) && !statutoryJurisdiction.trim()) {
      setValidationError('Set the organization jurisdiction before enabling statutory schemes.');
      return;
    }

    if (
      ptDefault &&
      !PROFESSIONAL_TAX_PRESETS.some(
        (preset) => preset.jurisdiction === statutoryJurisdiction.trim().toUpperCase(),
      )
    ) {
      setValidationError(
        `There is no reviewed professional-tax schedule for ${statutoryJurisdiction}. Turn off PT or add a verified state schedule under Payroll → Statutory rules.`,
      );
      return;
    }

    const saved = await compensation.savePolicy({
      effectiveFrom,
      basePercentage,
      hraPercentage,
      baseMinimum,
      defaultGrossSalary: parsedDefaultGross,
      statutoryJurisdiction: statutoryJurisdiction.trim().toUpperCase(),
      salarySlipDefault,
      pfDefault,
      esiDefault,
      ptDefault,
    });
    if (!saved) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold">Organization Salary Defaults</DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Set the default monthly gross and salary breakdown for your organization.
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
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Label htmlFor="policy-default-gross" className="text-xs font-bold text-foreground">
              Default monthly gross salary
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₹
              </span>
              <Input
                id="policy-default-gross"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={defaultGrossSalary}
                onChange={(event) => setDefaultGrossSalary(event.target.value)}
                className="h-10 pl-7 font-mono text-sm font-semibold"
                placeholder="e.g. 35000"
              />
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Prefills salary forms for employees without an individual salary and role-wise
              allotments. It does not overwrite saved employee gross amounts. Take-home and CTC use
              each employee&apos;s applicable payroll rules.
            </p>
          </div>

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
              <span>40% (Common)</span>
              <span>50% (Higher HRA)</span>
            </div>
          </div>

          {/* Live Calculated Breakdown Preview */}
          {preview.gross > 0 && (
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
          )}

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
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                To apply this policy to an existing draft, choose a date on or before the start of
                its pay period. Statutory rates use their government effective dates.
              </p>
            </div>
          </div>

          <section className="space-y-3 rounded-lg border border-border/80 bg-card p-3">
            <div>
              <h3 className="text-xs font-bold text-foreground">Organization statutory defaults</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                These defaults fill in where an employee or role has no matching setting. Saving
                creates missing verified EPF, ESI and state PT rules using their government
                effective dates. Existing custom rules are kept, and the policy&apos;s Effective From
                date controls when its deduction defaults apply.
              </p>
            </div>
            {compensation.organizationPolicyLoading && (
              <p className="text-xs text-muted-foreground" role="status">
                Loading saved organization payroll defaults…
              </p>
            )}
            {(compensation.organizationPolicyError || compensation.organizationPolicyForbidden) && (
              <p className="text-xs text-destructive" role="alert">
                {compensation.organizationPolicyForbidden
                  ? 'You need payroll policy read permission to configure organization defaults.'
                  : compensation.organizationPolicyError}
              </p>
            )}
            <div>
              <Label
                htmlFor="policy-statutory-jurisdiction"
                className="mb-1 block text-xs font-semibold"
              >
                Payroll state or territory
              </Label>
              <select
                id="policy-statutory-jurisdiction"
                value={statutoryJurisdiction.toUpperCase()}
                onChange={(event) => {
                  setStatutoryJurisdiction(event.target.value);
                  setValidationError(null);
                }}
                disabled={compensation.saving}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a state or territory</option>
                {statutoryJurisdiction &&
                  !INDIA_PAYROLL_JURISDICTIONS.some(
                    (state) => state.toUpperCase() === statutoryJurisdiction.toUpperCase(),
                  ) && (
                    <option value={statutoryJurisdiction.toUpperCase()}>
                      {statutoryJurisdiction} (saved/custom)
                    </option>
                  )}
                {INDIA_PAYROLL_JURISDICTIONS.map((state) => (
                  <option key={state} value={state.toUpperCase()}>
                    {state}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {primaryBranchState
                  ? `Suggested from the primary branch address: ${primaryBranchState}.`
                  : 'Suggested from the primary branch address when one is available.'}{' '}
                State-based payroll rules use this jurisdiction by default; branch or employee
                policies can override it.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'EPF', checked: pfDefault, onChange: setPfDefault },
                { label: 'ESI', checked: esiDefault, onChange: setEsiDefault },
                { label: 'Professional Tax', checked: ptDefault, onChange: setPtDefault },
              ].map((scheme) => (
                <label
                  key={scheme.label}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium"
                >
                  <input
                    type="checkbox"
                    checked={scheme.checked}
                    onChange={(event) => scheme.onChange(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {scheme.label} default on
                </label>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium">
              <input
                type="checkbox"
                checked={salarySlipDefault}
                onChange={(event) => setSalarySlipDefault(event.target.checked)}
                className="size-4 accent-primary"
              />
              Employees can see released payslips in Payroll
            </label>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Turn this off to hide the Payslips tab from employees and block access to their
              payslips. Admin payroll review and released payroll records are unchanged.
            </p>
            {validationError && (
              <p className="text-xs text-destructive" role="alert">
                {validationError}
              </p>
            )}
          </section>

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
              disabled={
                compensation.saving || compensation.organizationPolicyLoading || !currentPolicy
              }
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
