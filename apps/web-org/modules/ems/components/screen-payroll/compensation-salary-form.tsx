'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { type SalaryProfile, type PayrollPolicy, LIMITS } from '@smarteam/contracts';
import { Check, Save } from 'lucide-react';
import type { CompensationState } from '../../hooks/use-compensation';
import { useOvertimeRates } from '../../hooks/use-overtime-rates';

interface CompensationSalaryFormProps {
  compensation: CompensationState;
  profile: SalaryProfile;
  pfEnabled: boolean;
  ptEnabled: boolean;
  esiEnabled: boolean;
  onTogglePf: () => void;
  onTogglePt: () => void;
  onToggleEsi: () => void;
  onConfigureStatutory?: () => void;
  /** Reports the salary as it is typed, so the figures beside it can preview it. */
  onGrossChange?: (value: string) => void;
  policies?: PayrollPolicy[];
  selectedPolicyId?: string;
  onSelectedPolicyIdChange?: (value: string) => void;
}

const today = () => new Date().toLocaleDateString('en-CA');

function SchemeSwitch({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={on}
      className={`flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
        on
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border ${
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        }`}
      >
        {on && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}

/**
 * Everything an administrator sets for a salary, in one card: the monthly gross, when it starts,
 * which statutory schemes apply, and Save. These were spread over three cards, with Save at the
 * bottom of a fourth.
 */
export function CompensationSalaryForm({
  compensation,
  profile,
  pfEnabled,
  ptEnabled,
  esiEnabled,
  onTogglePf,
  onTogglePt,
  onToggleEsi,
  onConfigureStatutory,
  onGrossChange,
  policies = [],
  selectedPolicyId = '',
  onSelectedPolicyIdChange,
}: CompensationSalaryFormProps) {
  const current = profile.compensation;
  const policy = profile.employeePolicy;
  const [monthlyGrossInput, setMonthlyGrossInput] = useState('');
  // Salaries are usually agreed as so many lakh a year; the monthly gross follows from that.
  const [unit, setUnit] = useState<'monthly' | 'annual'>('monthly');
  const [lpaInput, setLpaInput] = useState('');
  const setMonthly = (value: string) => {
    setMonthlyGrossInput(value);
    onGrossChange?.(value);
  };
  const fromLpa = (lpa: string) => {
    setLpaInput(lpa);
    const annual = Number(lpa) * 100_000;
    setMonthly(
      lpa !== '' && Number.isFinite(annual) && annual >= 0 ? String(Math.round(annual / 12)) : '',
    );
  };
  const [effectiveFrom, setEffectiveFrom] = useState('');
  // What this employee's overtime pays, as a multiple of their hourly rate. The company's
  // standard rate is only the starting point for a new salary; this is what payroll pays.
  const companyRates = useOvertimeRates();
  const [overtimeInput, setOvertimeInput] = useState('');
  const locked = compensation.saving || !compensation.can.saveSalary;

  useEffect(() => {
    const gross = Number(current?.grossSalary ?? current?.baseAmount ?? 0);
    setMonthlyGrossInput(gross > 0 ? String(gross) : '');
    onGrossChange?.(gross > 0 ? String(gross) : '');
    setLpaInput(gross > 0 ? String(Number(((gross * 12) / 100_000).toFixed(2))) : '');
    // A change starts today unless the administrator picks another date, so editing a salary
    // revises it from today rather than rewriting the months already paid at the old amount.
    setEffectiveFrom(today());
    setOvertimeInput(
      current?.overtimeMultiplier === undefined ? '' : String(Number(current.overtimeMultiplier)),
    );
  }, [current]);

  // A first salary starts at the company's standard rate.
  useEffect(() => {
    if (!current && overtimeInput === '' && companyRates.rates)
      setOvertimeInput(String(companyRates.rates.standard));
  }, [companyRates.rates, current, overtimeInput]);

  const grossSalary = Number(monthlyGrossInput);
  const overtimeMultiplier = Number(overtimeInput);
  const overtimeValid =
    overtimeInput !== '' &&
    Number.isFinite(overtimeMultiplier) &&
    overtimeMultiplier >= 1 &&
    overtimeMultiplier <= 5;
  const valid =
    monthlyGrossInput !== '' && Number.isFinite(grossSalary) && grossSalary >= 0 && overtimeValid;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !effectiveFrom || locked) return;
    await compensation.saveSalary({
      grossSalary,
      overtimeMultiplier,
      effectiveFrom,
      payrollEnabled: policy?.payrollEnabled ?? true,
      salarySlipMode: policy?.salarySlipMode ?? 'ENABLED',
      pfEnabled,
      esiEnabled,
      ptEnabled,
      ...(selectedPolicyId ? { payrollPolicyId: selectedPolicyId } : {}),
    });
  };

  return (
    <form
      className="w-full min-w-0 space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
      onSubmit={submit}
    >
      <h3 className="text-sm font-bold text-foreground">Salary</h3>

      {onSelectedPolicyIdChange && (
        <div className="space-y-1.5">
          <Label htmlFor="salary-structure-assignment">Salary structure</Label>
          <SelectMenu
            value={selectedPolicyId || '__inherit__'}
            onValueChange={(value) =>
              onSelectedPolicyIdChange(value === '__inherit__' ? '' : value)
            }
          >
            <SelectTrigger id="salary-structure-assignment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">Organization default</SelectItem>
              {policies
                .filter((item) => Boolean(item.id))
                .map((item) => (
                  <SelectItem key={item.id} value={item.id!}>
                    {item.name ?? 'Salary structure'}
                  </SelectItem>
                ))}
            </SelectContent>
          </SelectMenu>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold" htmlFor="gross-salary">
              Gross salary
            </Label>
            <div className="flex rounded-md border border-border p-0.5 text-[11px]" role="group">
              {(
                [
                  ['monthly', 'Monthly'],
                  ['annual', 'Annual (LPA)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  aria-pressed={unit === id}
                  className={`rounded px-2 py-0.5 font-semibold ${
                    unit === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                  key={id}
                  onClick={() => setUnit(id)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ₹
            </span>
            {unit === 'monthly' ? (
              <Input
                max={LIMITS.amount}
                className="h-10 pl-7 tabular-nums text-sm font-semibold"
                disabled={locked}
                id="gross-salary"
                inputMode="decimal"
                min={0}
                onChange={(event) => {
                  setMonthly(event.target.value);
                  const annual = Number(event.target.value) * 12;
                  setLpaInput(
                    event.target.value === '' ? '' : String(Number((annual / 100_000).toFixed(2))),
                  );
                }}
                placeholder="e.g. 50000"
                type="number"
                value={monthlyGrossInput}
              />
            ) : (
              <Input
                max={1000}
                className="h-10 pl-7 pr-12 tabular-nums text-sm font-semibold"
                disabled={locked}
                id="gross-salary"
                inputMode="decimal"
                min={0}
                onChange={(event) => fromLpa(event.target.value)}
                placeholder="e.g. 6"
                step="0.01"
                type="number"
                value={lpaInput}
              />
            )}
            {unit === 'annual' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                lakh
              </span>
            )}
          </div>
          {valid && grossSalary > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {unit === 'monthly'
                ? `Annual gross ₹${(grossSalary * 12).toLocaleString('en-IN')}`
                : `Monthly gross ₹${grossSalary.toLocaleString('en-IN')}`}
            </p>
          )}
        </div>
        <div>
          <Label className="mb-1 block text-xs font-semibold" htmlFor="salary-overtime">
            Overtime rate
          </Label>
          <Input
            className="h-10 tabular-nums text-sm font-semibold"
            disabled={locked}
            id="salary-overtime"
            inputMode="decimal"
            max={5}
            min={1}
            onChange={(event) => setOvertimeInput(event.target.value)}
            placeholder="e.g. 1.5"
            step="0.1"
            type="number"
            value={overtimeInput}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs font-semibold" htmlFor="salary-effective-from">
            Starts from
          </Label>
          <DatePicker
            className="h-10 w-full text-sm"
            disabled={locked}
            id="salary-effective-from"
            onChange={setEffectiveFrom}
            value={effectiveFrom}
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Statutory deductions</p>
        <div className="flex flex-wrap gap-2">
          <SchemeSwitch disabled={locked} label="PF" on={pfEnabled} onClick={onTogglePf} />
          <SchemeSwitch disabled={locked} label="ESI" on={esiEnabled} onClick={onToggleEsi} />
          <SchemeSwitch
            disabled={locked}
            label="Professional Tax"
            on={ptEnabled}
            onClick={onTogglePt}
          />
        </div>
        {onConfigureStatutory && compensation.can.savePolicy && (
          <Button
            className="mt-2 h-auto px-0 text-xs"
            onClick={onConfigureStatutory}
            size="sm"
            type="button"
            variant="link"
          >
            Configure contribution rates and caps
          </Button>
        )}
      </div>

      {compensation.saveError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {compensation.saveError}
        </p>
      )}

      {compensation.can.saveSalary && (
        <div className="flex justify-end">
          <Button
            className="h-10 w-full gap-1.5 sm:w-auto"
            disabled={compensation.saving || !valid || !effectiveFrom}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {compensation.saving ? 'Saving…' : 'Save salary'}
          </Button>
        </div>
      )}
    </form>
  );
}
