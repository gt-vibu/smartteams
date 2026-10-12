'use client';

import React, { useMemo, useState } from 'react';
import { LoadingIndicator, Badge, Button, DatePicker, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select } from '@smarteam/ui';
import {
  formatMoney,
  hasPermission,
  type PayrollPolicy,
  type StatutoryRule,
  formatDate,
} from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { payrollRepository } from '../../repositories/payroll.repository';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { OvertimeRatesCard } from './overtime-rates-card';
import { AdvanceRulesCard } from './advance-rules-card';
import { localDateKey } from '../../lib/local-date';

/**
 * The statutory rules and payroll policy the backend actually applies.
 *
 * Replaces a screen backed by `statutory-rules.json` and `localStorage`, which presented a
 * catalogue of PF, ESI and professional-tax rates, per-state PT slabs and company registration
 * numbers as if they were configuration. None of it reached a payroll calculation: the browser
 * held it, and the run priced its deductions from `PayrollStatutoryRule` rows it had never seen.
 *
 * PAN, TAN, EPF/ESI/PT registration codes, tax regime and gratuity have no backend field at all,
 * so they are not shown. Effective-dated contribution rules can be edited by payroll policy writers.
 */

const rate = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : `${value}%`;

const amount = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : formatMoney(value);

function PolicySummary({ policy, canWrite, onEdit, onEditEpf }: { policy: PayrollPolicy; canWrite: boolean; onEdit: () => void; onEditEpf: () => void }) {
  const rows = [
    { label: 'Day basis', value: String(policy.payrollDayBasis) },
    { label: 'Base share of gross', value: `${policy.basePercentage}%` },
    { label: 'Base minimum', value: formatMoney(policy.baseMinimum) },
    { label: 'HRA share of base', value: `${policy.hraPercentage}%` },
    { label: 'Default monthly gross', value: policy.defaultGrossSalary == null ? 'Not set' : formatMoney(policy.defaultGrossSalary) },
    { label: 'Rounding', value: policy.roundingMode.replace(/_/g, ' ').toLowerCase() },
    { label: 'Jurisdiction', value: policy.statutoryJurisdiction ?? 'Not set' },
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {rows.map((row) => (
          <div className="bg-card px-4 py-3" key={row.label}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {row.label}
            </dt>
            <dd className="mt-1 font-mono text-xs font-bold text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Provident fund', on: policy.pfDefault },
          { label: 'ESI', on: policy.esiDefault },
          { label: 'Professional tax', on: policy.ptDefault },
          { label: 'Salary slips', on: policy.salarySlipDefault },
        ].map((flag) => (
          <Badge key={flag.label} variant={flag.on ? 'success' : 'secondary'}>
            {flag.label} {flag.on ? 'on by default' : 'off by default'}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
          This is the default for employees without an individual salary. Set personal exceptions in employee compensation or apply salaries by role from Compensation.
        </p>
        {canWrite && <div className="flex flex-wrap gap-2"><Button size="sm" type="button" variant="outline" onClick={onEditEpf}>Edit EPF rates &amp; cap</Button><Button size="sm" type="button" variant="outline" onClick={onEdit}>Edit default structure</Button></div>}
      </div>
    </div>
  );
}

function DefaultSalaryStructureDialog({
  open,
  policy,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  policy: PayrollPolicy;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { basePercentage: number; baseMinimum: number; hraPercentage: number; defaultGrossSalary: number; pfDefault: boolean; esiDefault: boolean; ptDefault: boolean; effectiveFrom: string }) => void;
}) {
  const [basePercentage, setBasePercentage] = useState(String(policy.basePercentage));
  const [baseMinimum, setBaseMinimum] = useState(String(policy.baseMinimum));
  const [hraPercentage, setHraPercentage] = useState(String(policy.hraPercentage));
  const [effectiveFrom, setEffectiveFrom] = useState(localDateKey());
  const [salaryMode, setSalaryMode] = useState<'MONTHLY' | 'LPA'>('MONTHLY');
  const [grossSalary, setGrossSalary] = useState('');
  const [pfDefault, setPfDefault] = useState(policy.pfDefault);
  const [esiDefault, setEsiDefault] = useState(policy.esiDefault);
  const [ptDefault, setPtDefault] = useState(policy.ptDefault);

  React.useEffect(() => {
    if (!open) return;
    setBasePercentage(String(policy.basePercentage));
    setBaseMinimum(String(policy.baseMinimum));
    setHraPercentage(String(policy.hraPercentage));
    setEffectiveFrom(localDateKey());
    setSalaryMode('MONTHLY');
    setGrossSalary(policy.defaultGrossSalary == null ? '' : String(policy.defaultGrossSalary));
    setPfDefault(policy.pfDefault);
    setEsiDefault(policy.esiDefault);
    setPtDefault(policy.ptDefault);
  }, [open, policy]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const base = Number(basePercentage);
    const minimum = Number(baseMinimum);
    const hra = Number(hraPercentage);
    if (!Number.isFinite(base) || base <= 0 || base > 100 || !Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(hra) || hra < 0 || hra > 100 || !effectiveFrom) return;
    const enteredGross = Number(grossSalary);
    if (!grossSalary.trim() || !Number.isFinite(enteredGross) || enteredGross <= 0) return;
    const monthlyGross = salaryMode === 'LPA' ? enteredGross * 100000 / 12 : enteredGross;
    onSave({ basePercentage: base, baseMinimum: minimum, hraPercentage: hra, defaultGrossSalary: monthlyGross, pfDefault, esiDefault, ptDefault, effectiveFrom });
  };

  const changeSalaryMode = (next: 'MONTHLY' | 'LPA') => {
    if (next === salaryMode) return;
    const amount = Number(grossSalary);
    if (grossSalary.trim() && Number.isFinite(amount)) {
      setGrossSalary(String(next === 'LPA' ? amount * 12 / 100000 : amount * 100000 / 12));
    }
    setSalaryMode(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit organization default salary structure</DialogTitle>
          <p className="text-xs text-muted-foreground">Set the gross pay default for employees without an individual or role-wise salary assignment.</p>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="default-gross-salary">Gross salary paid to default employees</Label>
                <div className="inline-flex rounded-md border border-border bg-muted p-0.5" role="group" aria-label="Default salary period">
                  <button type="button" className={`rounded px-3 py-1.5 text-xs font-semibold ${salaryMode === 'MONTHLY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`} aria-pressed={salaryMode === 'MONTHLY'} onClick={() => changeSalaryMode('MONTHLY')} disabled={saving}>Monthly</button>
                  <button type="button" className={`rounded px-3 py-1.5 text-xs font-semibold ${salaryMode === 'LPA' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`} aria-pressed={salaryMode === 'LPA'} onClick={() => changeSalaryMode('LPA')} disabled={saving}>Annual (LPA)</button>
                </div>
              </div>
              <div className="relative">
                <Input id="default-gross-salary" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={salaryMode === 'LPA' ? 'e.g. 6.0' : 'e.g. 40000'} value={grossSalary} onChange={(event) => setGrossSalary(event.target.value)} disabled={saving} required aria-describedby="default-gross-help" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{salaryMode === 'LPA' ? 'LPA / year' : '₹ / month'}</span>
              </div>
              <p id="default-gross-help" className="text-[11px] text-muted-foreground">Required. This gross salary is used in payroll for employees without an individual or role-wise salary. Annual LPA is converted to a monthly amount.</p>
            </div>
            <div className="space-y-1"><Label htmlFor="default-base-percentage">Basic salary (% of gross)</Label><Input id="default-base-percentage" type="number" min="0.01" max="100" step="0.01" value={basePercentage} onChange={(event) => setBasePercentage(event.target.value)} disabled={saving} required /></div>
            <div className="space-y-1"><Label htmlFor="default-base-minimum">Basic salary minimum</Label><Input id="default-base-minimum" type="number" min="0" step="0.01" value={baseMinimum} onChange={(event) => setBaseMinimum(event.target.value)} disabled={saving} required /></div>
            <div className="space-y-1"><Label htmlFor="default-hra-percentage">HRA (% of basic)</Label><Input id="default-hra-percentage" type="number" min="0" max="100" step="0.01" value={hraPercentage} onChange={(event) => setHraPercentage(event.target.value)} disabled={saving} required /></div>
            <div className="space-y-1"><Label htmlFor="default-effective-from">Effective from</Label><DatePicker id="default-effective-from" value={effectiveFrom} onChange={setEffectiveFrom} disabled={saving} /></div>
            <fieldset className="space-y-2 sm:col-span-2"><legend className="text-xs font-semibold">Default deductions</legend><div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={pfDefault} onChange={(event) => setPfDefault(event.target.checked)} disabled={saving} /> EPF</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={esiDefault} onChange={(event) => setEsiDefault(event.target.checked)} disabled={saving} /> ESI</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={ptDefault} onChange={(event) => setPtDefault(event.target.checked)} disabled={saving} /> Professional tax</label>
            </div><p className="text-[11px] text-muted-foreground">Contribution rates and EPF wage cap are configured separately below in Statutory rules.</p></fieldset>
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button disabled={saving} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
            <Button disabled={saving} type="submit">{saving ? 'Saving…' : 'Save default structure'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesTable({
  rules,
  canWrite,
  onCreate,
  onEdit,
}: {
  rules: StatutoryRule[];
  canWrite: boolean;
  onCreate: () => void;
  onEdit: (rule: StatutoryRule) => void;
}) {
  if (rules.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-8 text-center">
        <p className="text-sm font-bold text-foreground">No statutory rules configured</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Add effective-dated contribution rules for your organization. Payroll keeps each completed run on its saved calculation.
        </p>
        {canWrite && <Button className="mt-3" onClick={onCreate} size="sm" type="button">Add a rule</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Contribution rules</h2>
          <p className="text-xs text-muted-foreground">Rates and amounts apply from the effective date shown.</p>
        </div>
        {canWrite && <Button onClick={onCreate} size="sm" type="button">Add rule</Button>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table stack-wide w-full min-w-[880px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Scheme</th>
            <th className="px-4 py-2.5 font-bold">Jurisdiction</th>
            <th className="px-4 py-2.5 font-bold">Effective from</th>
            <th className="px-4 py-2.5 text-right font-bold">Employee</th>
            <th className="px-4 py-2.5 text-right font-bold">Employer</th>
            <th className="px-4 py-2.5 text-right font-bold">Wage ceiling</th>
            <th className="px-4 py-2.5 text-right font-bold">Threshold</th>
            <th className="px-4 py-2.5 text-right font-bold">Flat amount</th>
            {canWrite && <th className="px-4 py-2.5 text-right font-bold">Action</th>}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={rule.id ?? `${rule.schemeCode}-${rule.jurisdiction}-${rule.effectiveFrom}`}
            >
              <td data-cell="primary" className="px-4 py-2.5 font-semibold text-foreground">
                {rule.schemeCode}
              </td>
              <td data-label="Jurisdiction" className="px-4 py-2.5 text-muted-foreground">
                {rule.jurisdiction}
              </td>
              <td
                data-label="Effective from"
                className="px-4 py-2.5 font-mono text-muted-foreground"
              >
                {formatDate(rule.effectiveFrom)}
              </td>
              <td
                data-label="Employee"
                className="px-4 py-2.5 text-right font-mono text-muted-foreground"
              >
                {rate(rule.employeeRate)}
              </td>
              <td
                data-label="Employer"
                className="px-4 py-2.5 text-right font-mono text-muted-foreground"
              >
                {rate(rule.employerRate)}
              </td>
              <td
                data-label="Wage ceiling"
                className="px-4 py-2.5 text-right font-mono text-muted-foreground"
              >
                {amount(rule.wageCeiling)}
              </td>
              <td
                data-label="Threshold"
                className="px-4 py-2.5 text-right font-mono text-muted-foreground"
              >
                {amount(rule.employeeThreshold)}
              </td>
              <td
                data-label="Flat amount"
                className="px-4 py-2.5 text-right font-mono text-muted-foreground"
              >
                {amount(rule.flatAmount)}
              </td>
              {canWrite && (
                <td data-label="Action" className="px-4 py-2.5 text-right">
                  <Button size="sm" type="button" variant="outline" onClick={() => onEdit(rule)}>Edit</Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function StatutoryRuleDialog({
  open,
  rule,
  initialJurisdiction,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  rule: StatutoryRule | null;
  initialJurisdiction: string;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: StatutoryRule) => void;
}) {
  const [schemeCode, setSchemeCode] = useState('EPF');
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [employeeRate, setEmployeeRate] = useState('');
  const [employerRate, setEmployerRate] = useState('');
  const [wageCeiling, setWageCeiling] = useState('');
  const [employeeThreshold, setEmployeeThreshold] = useState('');
  const [flatAmount, setFlatAmount] = useState('');

  React.useEffect(() => {
    if (!open) return;
    setSchemeCode(rule?.schemeCode ?? 'EPF');
    setJurisdiction(rule?.jurisdiction ?? initialJurisdiction);
    setEffectiveFrom(rule?.effectiveFrom.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setEffectiveTo(rule?.effectiveTo?.slice(0, 10) ?? '');
    // Give admins the current national EPF baseline as an editable starting point. Saving still
    // creates an organization-owned, effective-dated rule; calculations never read this UI value.
    setEmployeeRate(rule?.employeeRate == null ? (rule ? '' : '12') : String(rule.employeeRate));
    setEmployerRate(rule?.employerRate == null ? (rule ? '' : '12') : String(rule.employerRate));
    setWageCeiling(rule?.wageCeiling == null ? (rule ? '' : '25000') : String(rule.wageCeiling));
    setEmployeeThreshold(rule?.employeeThreshold == null ? '' : String(rule.employeeThreshold));
    setFlatAmount(rule?.flatAmount == null ? '' : String(rule.flatAmount));
  }, [open, rule, initialJurisdiction]);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numberOrUndefined = (value: string) => value.trim() === '' ? undefined : Number(value);
    onSave({
      schemeCode: schemeCode.trim().toUpperCase(),
      jurisdiction: jurisdiction.trim().toUpperCase(),
      effectiveFrom,
      ...(effectiveTo ? { effectiveTo } : {}),
      ...(numberOrUndefined(employeeRate) === undefined ? {} : { employeeRate: numberOrUndefined(employeeRate) }),
      ...(numberOrUndefined(employerRate) === undefined ? {} : { employerRate: numberOrUndefined(employerRate) }),
      ...(numberOrUndefined(wageCeiling) === undefined ? {} : { wageCeiling: numberOrUndefined(wageCeiling) }),
      ...(numberOrUndefined(employeeThreshold) === undefined ? {} : { employeeThreshold: numberOrUndefined(employeeThreshold) }),
      ...(schemeCode === 'PT' && numberOrUndefined(flatAmount) !== undefined
        ? { flatAmount: numberOrUndefined(flatAmount) }
        : {}),
    });
  };

  const numberField = (label: string, value: string, change: (value: string) => void, suffix?: string) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`statutory-${label.toLowerCase().replaceAll(' ', '-')}`}>{label}{suffix ? ` (${suffix})` : ''}</Label>
      <Input
        id={`statutory-${label.toLowerCase().replaceAll(' ', '-')}`}
        min="0"
        step="0.01"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => change(event.target.value)}
        disabled={saving}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {rule ? `Update ${schemeCode} contribution rule` : `Add ${schemeCode} contribution rule`}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Set rates, eligible wage limits, and effective dates. EPF and ESI use rates against eligible wages; fixed monthly amounts are only available for professional tax. Previous payroll runs keep their saved calculations.
          </p>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="statutory-scheme">Contribution type</Label>
              <Select id="statutory-scheme" className="h-9" value={schemeCode} onChange={(event) => setSchemeCode(event.target.value)} disabled={saving}>
                <option value="EPF">Provident fund (EPF)</option>
                <option value="ESIC">Employee insurance (ESI)</option>
                <option value="PT">Professional tax</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="statutory-jurisdiction">Country or state</Label>
              <Input id="statutory-jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} disabled={saving} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="statutory-effective-from">Effective from</Label>
              <DatePicker id="statutory-effective-from" value={effectiveFrom} onChange={setEffectiveFrom} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="statutory-effective-to">Effective to (optional)</Label>
              <DatePicker id="statutory-effective-to" value={effectiveTo} onChange={setEffectiveTo} disabled={saving} />
            </div>
            {numberField('Employee contribution', employeeRate, setEmployeeRate, '%')}
            {numberField('Employer contribution', employerRate, setEmployerRate, '%')}
            {numberField('Eligible wage cap', wageCeiling, setWageCeiling, 'currency / month')}
            {numberField('Eligibility threshold', employeeThreshold, setEmployeeThreshold, 'currency / month')}
            {schemeCode === 'PT' && numberField('Fixed professional tax', flatAmount, setFlatAmount, 'currency / month')}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {schemeCode === 'PT'
              ? 'Professional tax can use a fixed amount or a rate, depending on your configured rule.'
              : 'EPF and ESI amounts are calculated from the saved rates and eligible wages. Adjust the rate or wage cap to change the calculated contribution.'}
          </p>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button disabled={saving} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
            <Button disabled={saving || !schemeCode || !jurisdiction.trim() || !effectiveFrom} type="submit">
              {saving ? 'Saving…' : 'Save rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScreenPayrollLegalConfig() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'payroll.policy.read');
  const canWrite = hasPermission(permissions, 'payroll.policy.write');
  const [editingRule, setEditingRule] = useState<StatutoryRule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState('');
  const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState('');

  const policyResource = useAsyncResource<PayrollPolicy>(
    () => payrollRepository.getPolicy(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  const rulesResource = useAsyncResource<StatutoryRule[]>(
    () => payrollRepository.listStatutoryRules(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const saveRule = async (input: StatutoryRule) => {
    if (!organizationId || savingRule) return;
    setSavingRule(true);
    setRuleError('');
    try {
      await payrollRepository.saveStatutoryRule(organizationId, input);
      await rulesResource.refetch();
      setRuleDialogOpen(false);
    } catch (error) {
      setRuleError(error instanceof Error ? error.message : 'Could not save this payroll rule.');
    } finally {
      setSavingRule(false);
    }
  };

  const saveDefault = async (input: { basePercentage: number; baseMinimum: number; hraPercentage: number; defaultGrossSalary: number; pfDefault: boolean; esiDefault: boolean; ptDefault: boolean; effectiveFrom: string }) => {
    if (!organizationId || !policyResource.data || savingDefault) return;
    setSavingDefault(true);
    setDefaultError('');
    try {
      const current = policyResource.data;
      await payrollRepository.savePolicy(organizationId, {
        effectiveFrom: input.effectiveFrom,
        basePercentage: input.basePercentage,
        baseMinimum: input.baseMinimum,
        hraPercentage: input.hraPercentage,
        defaultGrossSalary: input.defaultGrossSalary,
        payrollDayBasis: current.payrollDayBasis,
        salarySlipDefault: current.salarySlipDefault,
        payrollEnabledDefault: current.payrollEnabledDefault,
        pfDefault: input.pfDefault,
        esiDefault: input.esiDefault,
        ptDefault: input.ptDefault,
        statutoryJurisdiction: current.statutoryJurisdiction ?? undefined,
        roundingMode: current.roundingMode as 'HALF_UP' | 'DOWN' | 'UP',
      });
      await policyResource.refetch();
      setDefaultDialogOpen(false);
    } catch (caught) {
      setDefaultError(caught instanceof Error ? caught.message : 'Could not save the organization default structure.');
    } finally {
      setSavingDefault(false);
    }
  };

  if (!canRead || policyResource.forbidden || rulesResource.forbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to view payroll policy.
        </p>
      </div>
    );
  }

  if (policyResource.loading || rulesResource.loading) {
    return (
      <LoadingIndicator variant="panel" label="Loading payroll policy" className="py-10 text-center text-xs text-muted-foreground" />
    );
  }

  const policy = policyResource.data;
  const error = policyResource.error ?? rulesResource.error;
  if (error || !policy) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="alert"
      >
        <p className="text-sm font-bold text-foreground">Could not load payroll policy</p>
        <p className="mt-1 text-xs text-muted-foreground">{error ?? 'No policy was returned.'}</p>
        <Button
          className="mt-3"
          onClick={() => void Promise.all([policyResource.refetch(), rulesResource.refetch()])}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="default-salary-structure-heading" className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div>
          <h2 id="default-salary-structure-heading" className="text-base font-semibold text-foreground">Organization default salary structure</h2>
          <p className="mt-1 text-xs text-muted-foreground">The tenant default is used when no employee salary is assigned. Employee and role-wise salary assignments take precedence.</p>
        </div>
        <PolicySummary
          policy={policy}
          canWrite={canWrite}
          onEdit={() => { setDefaultError(''); setDefaultDialogOpen(true); }}
          onEditEpf={() => {
            const rule = [...(rulesResource.data ?? [])]
              .filter((item) => item.schemeCode.toUpperCase() === 'EPF' && (!policy.statutoryJurisdiction || item.jurisdiction.toUpperCase() === policy.statutoryJurisdiction.toUpperCase()))
              .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
            setEditingRule(rule);
            setRuleError('');
            setRuleDialogOpen(true);
          }}
        />
      </section>
      <section aria-labelledby="statutory-rules-heading" className="space-y-3 rounded-xl border border-primary/20 bg-card p-4 sm:p-5">
        <div>
          <h2 id="statutory-rules-heading" className="text-base font-semibold text-foreground">EPF and statutory contribution settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure effective-dated rates and wage limits here. EPF and ESI use eligible wages; professional tax may also use a fixed amount.
          </p>
        </div>
        <RulesTable
          rules={rulesResource.data ?? []}
          canWrite={canWrite}
          onCreate={() => {
            setEditingRule(null);
            setRuleError('');
            setRuleDialogOpen(true);
          }}
          onEdit={(rule) => {
            setEditingRule(rule);
            setRuleError('');
            setRuleDialogOpen(true);
          }}
        />
      </section>
      <OvertimeRatesCard />
      <AdvanceRulesCard />
      <StatutoryRuleDialog
        open={ruleDialogOpen}
        rule={editingRule}
        initialJurisdiction={policy.statutoryJurisdiction ?? 'IN'}
        saving={savingRule}
        error={ruleError}
        onOpenChange={setRuleDialogOpen}
        onSave={(input) => void saveRule(input)}
      />
      <DefaultSalaryStructureDialog
        open={defaultDialogOpen}
        policy={policy}
        saving={savingDefault}
        error={defaultError}
        onOpenChange={setDefaultDialogOpen}
        onSave={(input) => void saveDefault(input)}
      />
    </div>
  );
}
