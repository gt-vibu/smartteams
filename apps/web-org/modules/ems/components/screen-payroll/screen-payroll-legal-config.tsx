'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, ConfirmDialog, Input, Label } from '@smarteam/ui';
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
import { ensureStateStatutoryRules } from './ensure-state-statutory-rules';
import {
  EPF_INDIA_PRESET,
  ESIC_INDIA_PRESET,
  INDIA_PAYROLL_JURISDICTIONS,
  PROFESSIONAL_TAX_COVERAGE,
  PROFESSIONAL_TAX_PRESETS,
  professionalTaxPresetForAutoApply,
  type StatutoryPreset,
} from './statutory-rule-presets';

/**
 * The statutory rules and payroll policy the backend actually applies.
 *
 * Replaces a screen backed by `statutory-rules.json` and `localStorage`, which presented a
 * catalogue of PF, ESI and professional-tax rates, per-state PT slabs and company registration
 * numbers as if they were configuration. None of it reached a payroll calculation: the browser
 * held it, and the run priced its deductions from `PayrollStatutoryRule` rows it had never seen.
 *
 * Statutory rule changes are written to the tenant database through permission-checked API
 * endpoints; this screen never substitutes local or hard-coded rates for those saved rules.
 * Organization tax identifiers, tax-regime declarations, gratuity accruals and filing workflows
 * remain separate compliance capabilities and are not represented by this rule editor.
 */

const rate = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : `${value}%`;

const amount = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : formatMoney(value);

type StatutoryRuleDraft = {
  schemeCode: 'EPF' | 'ESIC' | 'PT';
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo: string;
  employeeRate: string;
  employerRate: string;
  wageCeiling: string;
  employeeThreshold: string;
  flatAmount: string;
  slabs: string;
  salaryBasis: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY';
  amountBasis: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY';
  sourceLabel: string;
  sourceUrl: string;
  sourceNote: string;
};

const dateInputToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const newRuleDraft = (): StatutoryRuleDraft => ({
  schemeCode: 'EPF',
  jurisdiction: '',
  effectiveFrom: dateInputToday(),
  effectiveTo: '',
  employeeRate: '',
  employerRate: '',
  wageCeiling: '',
  employeeThreshold: '',
  flatAmount: '',
  slabs: '',
  salaryBasis: 'MONTHLY',
  amountBasis: 'MONTHLY',
  sourceLabel: '',
  sourceUrl: '',
  sourceNote: '',
});

const draftFromRule = (rule: StatutoryRule): StatutoryRuleDraft => ({
  schemeCode: rule.schemeCode === 'ESIC' || rule.schemeCode === 'PT' ? rule.schemeCode : 'EPF',
  jurisdiction: rule.jurisdiction,
  effectiveFrom: rule.effectiveFrom.slice(0, 10),
  effectiveTo: rule.effectiveTo?.slice(0, 10) ?? '',
  employeeRate: rule.employeeRate == null ? '' : String(rule.employeeRate),
  employerRate: rule.employerRate == null ? '' : String(rule.employerRate),
  wageCeiling: rule.wageCeiling == null ? '' : String(rule.wageCeiling),
  employeeThreshold: rule.employeeThreshold == null ? '' : String(rule.employeeThreshold),
  flatAmount: rule.flatAmount == null ? '' : String(rule.flatAmount),
  slabs: Array.isArray(rule.metadata?.slabs) ? JSON.stringify(rule.metadata.slabs, null, 2) : '',
  salaryBasis:
    rule.metadata?.salaryBasis === 'ANNUAL' || rule.metadata?.salaryBasis === 'HALF_YEARLY'
      ? rule.metadata.salaryBasis
      : 'MONTHLY',
  amountBasis:
    rule.metadata?.amountBasis === 'ANNUAL' || rule.metadata?.amountBasis === 'HALF_YEARLY'
      ? rule.metadata.amountBasis
      : 'MONTHLY',
  sourceLabel: typeof rule.metadata?.sourceLabel === 'string' ? rule.metadata.sourceLabel : '',
  sourceUrl: typeof rule.metadata?.sourceUrl === 'string' ? rule.metadata.sourceUrl : '',
  sourceNote: typeof rule.metadata?.sourceNote === 'string' ? rule.metadata.sourceNote : '',
});

function applyProfessionalTaxPreset(preset: StatutoryPreset): Partial<StatutoryRuleDraft> {
  const originalSlabs = preset.slabs ?? [];
  const slabs = convertSlabsToMonthly(originalSlabs, preset.salaryBasis, preset.amountBasis);
  return {
    schemeCode: 'PT',
    jurisdiction: preset.jurisdiction,
    effectiveFrom: preset.effectiveFrom,
    effectiveTo: '',
    employeeRate: preset.employeeRate == null ? '' : String(preset.employeeRate),
    employerRate: preset.employerRate == null ? '' : String(preset.employerRate),
    wageCeiling: preset.wageCeiling == null ? '' : String(preset.wageCeiling),
    employeeThreshold: preset.employeeThreshold == null ? '' : String(preset.employeeThreshold),
    flatAmount: '',
    slabs: preset.slabs ? JSON.stringify(slabs, null, 2) : '',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    sourceLabel: preset.sourceLabel,
    sourceUrl: preset.sourceUrl,
    sourceNote: preset.note,
  };
}

function convertSlabsToMonthly(
  slabs: unknown[],
  salaryBasis: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY' = 'MONTHLY',
  amountBasis: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY' = 'MONTHLY',
) {
  const divideBy = (value: unknown, basis: string) => {
    const number = Number(value);
    if (basis === 'ANNUAL') return Number((number / 12).toFixed(6));
    if (basis === 'HALF_YEARLY') return Number((number / 6).toFixed(6));
    return number;
  };
  return slabs.map((value) => {
    const slab = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const overrides =
      slab.monthOverrides && typeof slab.monthOverrides === 'object'
        ? (slab.monthOverrides as Record<string, unknown>)
        : null;
    return {
      ...slab,
      min: divideBy(slab.min, salaryBasis),
      max: slab.max == null ? null : divideBy(slab.max, salaryBasis),
      amount: divideBy(slab.amount, amountBasis),
      ...(overrides
        ? {
            monthOverrides: Object.fromEntries(
              Object.entries(overrides).map(([month, amount]) => [
                month,
                divideBy(amount, amountBasis),
              ]),
            ),
          }
        : {}),
    };
  });
}

function readSlabs(
  value: string,
): Array<{ min: string; max: string; amount: string; february: string }> {
  if (!value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const cell = (raw: unknown, fallback: string) =>
      typeof raw === 'string' || typeof raw === 'number' ? String(raw) : fallback;
    return parsed.map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const overrides =
        row.monthOverrides && typeof row.monthOverrides === 'object'
          ? (row.monthOverrides as Record<string, unknown>)
          : {};
      return {
        min: cell(row.min, '0'),
        max: cell(row.max, ''),
        amount: cell(row.amount, '0'),
        february: cell(overrides['2'], ''),
      };
    });
  } catch {
    return [];
  }
}

function writeSlabs(rows: ReturnType<typeof readSlabs>) {
  return JSON.stringify(
    rows.map((row) => ({
      min: Number(row.min || 0),
      max: row.max.trim() ? Number(row.max) : null,
      amount: Number(row.amount || 0),
      ...(row.february.trim() ? { monthOverrides: { '2': Number(row.february) } } : {}),
    })),
    null,
    2,
  );
}

function PolicySummary({ policy }: { policy: PayrollPolicy }) {
  const rows = [
    { label: 'Base share of gross', value: `${policy.basePercentage}%` },
    { label: 'Base minimum', value: formatMoney(policy.baseMinimum) },
    { label: 'HRA share of base', value: `${policy.hraPercentage}%` },
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
          { label: 'Employee payslips', on: policy.salarySlipDefault },
        ].map((flag) => (
          <Badge key={flag.label} variant={flag.on ? 'success' : 'secondary'}>
            {flag.label} {flag.on ? 'on by default' : 'off by default'}
          </Badge>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Salary proration uses scheduled working days from Organization Settings, with branch
        holidays and eligible optional holidays removed from the period total.
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        These defaults apply to an employee with no policy of their own. Whether a scheme is legally
        applicable is decided by the backend from the rule&apos;s threshold and ceiling — a switch
        here cannot remove a deduction an employee is covered by.
      </p>
    </div>
  );
}

function ProfessionalTaxCoveragePanel() {
  const statusLabel = {
    AUTO_SCHEDULE: 'Schedule available',
    LOCAL_BODY_REQUIRED: 'Local body needed',
    ADMIN_REVIEW_REQUIRED: 'Review needed',
  } as const;
  const statusClass = {
    AUTO_SCHEDULE: 'border-emerald-700/20 bg-emerald-700/5 text-emerald-800',
    LOCAL_BODY_REQUIRED: 'border-amber-600/20 bg-amber-500/5 text-amber-800',
    ADMIN_REVIEW_REQUIRED: 'border-border bg-muted/30 text-muted-foreground',
  } as const;

  return (
    <details className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-2xs">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Professional Tax coverage · {PROFESSIONAL_TAX_COVERAGE.length} states and territories
      </summary>
      <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
        Only a reviewed state schedule is added automatically. Local-body and review-needed
        jurisdictions are never assigned a guessed amount. Add or confirm their official rule before
        running payroll with PT enabled.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PROFESSIONAL_TAX_COVERAGE.map((entry) => (
          <li className="rounded-lg border border-border/70 p-3" key={entry.jurisdiction}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">{entry.jurisdiction}</span>
              <Badge className={statusClass[entry.status]}>{statusLabel[entry.status]}</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{entry.detail}</p>
            {entry.sourceUrl && (
              <a
                className="mt-2 inline-block text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                href={entry.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Official source
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RulesTable({
  rules,
  canWrite,
  onEdit,
  onDelete,
}: {
  rules: StatutoryRule[];
  canWrite: boolean;
  onEdit: (rule: StatutoryRule) => void;
  onDelete: (rule: StatutoryRule) => void;
}) {
  if (rules.length === 0) {
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-bold text-foreground">No statutory rules configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add the verified rules above, then set the same jurisdiction and choose organization
          defaults in Compensation → Organization payroll defaults. Payroll will not invent or apply
          statutory rates until those settings match.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table stack-wide w-full min-w-[820px] text-left text-xs">
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
            <th className="px-4 py-2.5 text-right font-bold">Source</th>
            {canWrite && <th className="px-4 py-2.5 text-right font-bold">Actions</th>}
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
              <td data-label="Source" className="px-4 py-2.5 text-right">
                {typeof rule.metadata?.sourceUrl === 'string' ? (
                  <a
                    className="font-medium text-primary underline"
                    href={rule.metadata.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {typeof rule.metadata.sourceLabel === 'string' ? 'View source' : 'Reference'}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Custom</span>
                )}
              </td>
              {canWrite && (
                <td data-label="Actions" className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => onEdit(rule)} size="sm" type="button" variant="outline">
                      Edit
                    </Button>
                    <Button
                      onClick={() => onDelete(rule)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScreenPayrollLegalConfig() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'payroll.policy.read');
  const canWrite = hasPermission(permissions, 'payroll.policy.write');
  const [draft, setDraft] = useState<StatutoryRuleDraft>(newRuleDraft);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [rulePendingDelete, setRulePendingDelete] = useState<StatutoryRule | null>(null);
  const autoDefaultsKey = useRef<string | null>(null);

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

  useEffect(() => {
    const policy = policyResource.data;
    const jurisdiction = policy?.statutoryJurisdiction?.trim().toUpperCase();
    if (
      !organizationId ||
      !canWrite ||
      !policy ||
      !rulesResource.data ||
      policyResource.loading ||
      rulesResource.loading ||
      !jurisdiction
    ) {
      return;
    }

    const enabled = { epf: policy.pfDefault, esic: policy.esiDefault, pt: policy.ptDefault };
    if (!enabled.epf && !enabled.esic && !enabled.pt) return;
    const key = `${organizationId}:${jurisdiction}:${Number(enabled.epf)}:${Number(enabled.esic)}:${Number(enabled.pt)}`;
    if (autoDefaultsKey.current === key) return;
    autoDefaultsKey.current = key;

    void ensureStateStatutoryRules(organizationId, jurisdiction, enabled)
      .then(async ({ created, unsupported, notify, error }) => {
        if (error) {
          if (notify) {
            setMutationError(
              error instanceof Error
                ? `Could not create missing state rules: ${error.message}`
                : 'Could not create missing state rules.',
            );
          }
          return;
        }
        await rulesResource.refetch();
        if (!notify) return;
        if (unsupported.length) {
          setMutationError(
            `${created.length ? `Added ${created.join(', ')} rules for ${jurisdiction}. ` : ''}No reviewed ${unsupported.join(', ')} schedule is available for this state; no rate was guessed.`,
          );
        } else if (created.length) {
          setMutationMessage(
            `Added ${created.join(', ')} rules for ${jurisdiction} from the reviewed state defaults.`,
          );
        }
      })
      .catch(() => undefined);
  }, [
    canWrite,
    organizationId,
    policyResource.data,
    policyResource.loading,
    rulesResource.data,
    rulesResource.loading,
    rulesResource.refetch,
  ]);

  useEffect(() => {
    const jurisdiction = policyResource.data?.statutoryJurisdiction;
    if (!editingRuleId && jurisdiction) {
      setDraft((current) => (current.jurisdiction ? current : { ...current, jurisdiction }));
    }
  }, [editingRuleId, policyResource.data?.statutoryJurisdiction]);

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
      <p className="py-10 text-center text-xs text-muted-foreground" role="status">
        Loading payroll policy...
      </p>
    );
  }

  const error = policyResource.error ?? rulesResource.error;
  if (error || !policyResource.data) {
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

  const payrollPolicy = policyResource.data;

  const updateDraft = (key: keyof StatutoryRuleDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMutationError(null);
    setMutationMessage(null);
  };

  const applyPreset = (preset: StatutoryPreset) => {
    setDraft((current) => ({ ...current, ...applyProfessionalTaxPreset(preset) }));
    setMutationError(null);
    setMutationMessage(null);
  };

  const applyContributionPreset = (scheme: 'EPF' | 'ESIC') => {
    const preset = scheme === 'EPF' ? EPF_INDIA_PRESET : ESIC_INDIA_PRESET;
    setDraft((current) => ({
      ...current,
      schemeCode: scheme,
      jurisdiction: current.jurisdiction || policyResource.data?.statutoryJurisdiction || 'INDIA',
      effectiveFrom: preset.effectiveFrom,
      employeeRate: String(preset.employeeRate),
      employerRate: String(preset.employerRate),
      wageCeiling: String(preset.wageCeiling),
      employeeThreshold: 'employeeThreshold' in preset ? String(preset.employeeThreshold) : '',
      flatAmount: '',
      slabs: '',
      salaryBasis: 'MONTHLY',
      amountBasis: 'MONTHLY',
      sourceLabel: preset.sourceLabel,
      sourceUrl: preset.sourceUrl,
      sourceNote: preset.note,
    }));
    setMutationError(null);
    setMutationMessage(null);
  };

  const changeScheme = (schemeCode: StatutoryRuleDraft['schemeCode']) => {
    if (schemeCode === 'EPF' || schemeCode === 'ESIC') {
      applyContributionPreset(schemeCode);
      return;
    }
    const configuredJurisdiction =
      draft.jurisdiction || policyResource.data?.statutoryJurisdiction || '';
    const ptPreset = professionalTaxPresetForAutoApply(configuredJurisdiction);
    if (ptPreset) {
      applyPreset(ptPreset);
      return;
    }
    setDraft((current) => ({
      ...newRuleDraft(),
      schemeCode,
      jurisdiction: configuredJurisdiction,
      effectiveFrom: current.effectiveFrom,
    }));
    setMutationError(null);
    setMutationMessage(null);
  };

  const editRule = (rule: StatutoryRule) => {
    if (!rule.id) return;
    setEditingRuleId(rule.id);
    setDraft(draftFromRule(rule));
    setMutationError(null);
    setMutationMessage(null);
  };

  const saveRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canWrite || savingRule) return;
    setMutationError(null);
    setMutationMessage(null);

    const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
    if (!draft.jurisdiction.trim() || !draft.effectiveFrom) {
      setMutationError('Choose a jurisdiction and effective start date.');
      return;
    }
    const numericValues = [
      draft.employeeRate,
      draft.employerRate,
      draft.wageCeiling,
      draft.employeeThreshold,
      draft.flatAmount,
    ].filter((value) => value.trim() !== '');
    if (numericValues.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setMutationError('Enter valid non-negative values for rates, ceilings and thresholds.');
      return;
    }

    let metadata: Record<string, unknown> = {};
    if (draft.slabs.trim()) {
      try {
        const parsed: unknown = JSON.parse(draft.slabs);
        if (!Array.isArray(parsed)) throw new Error('The slab schedule must be a JSON array.');
        const normalizedSlabs = parsed.map((value, index) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Salary band ${index + 1} is invalid.`);
          }
          const slab = value as Record<string, unknown>;
          const min = Number(slab.min);
          const max = slab.max == null ? null : Number(slab.max);
          const tax = Number(slab.amount);
          if (
            !Number.isFinite(min) ||
            min < 0 ||
            !Number.isFinite(tax) ||
            tax < 0 ||
            (max !== null && (!Number.isFinite(max) || max < min))
          ) {
            throw new Error(
              `Check the minimum, maximum and tax amount in salary band ${index + 1}.`,
            );
          }
          return { ...slab, min, max };
        });
        const orderedSlabs = [...normalizedSlabs].sort((a, b) => Number(a.min) - Number(b.min));
        for (let index = 1; index < orderedSlabs.length; index += 1) {
          const previous = orderedSlabs[index - 1];
          const current = orderedSlabs[index];
          if (!previous || !current) continue;
          const previousMax = previous.max;
          if (previousMax === null || Number(current.min) <= Number(previousMax)) {
            throw new Error('Salary bands cannot overlap. Adjust the upper and lower limits.');
          }
        }
        metadata = {
          slabs: convertSlabsToMonthly(parsed, draft.salaryBasis, draft.amountBasis),
        };
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : 'Enter a valid JSON slab schedule.',
        );
        return;
      }
    }
    metadata = {
      ...metadata,
      salaryBasis: 'MONTHLY',
      amountBasis: 'MONTHLY',
      ...(draft.sourceLabel ? { sourceLabel: draft.sourceLabel } : {}),
      ...(draft.sourceUrl ? { sourceUrl: draft.sourceUrl } : {}),
      ...(draft.sourceNote ? { sourceNote: draft.sourceNote } : {}),
    };

    setSavingRule(true);
    try {
      await payrollRepository.saveStatutoryRule(
        organizationId,
        {
          schemeCode: draft.schemeCode,
          jurisdiction: draft.jurisdiction.trim().toUpperCase(),
          effectiveFrom: draft.effectiveFrom,
          ...(draft.effectiveTo ? { effectiveTo: draft.effectiveTo } : {}),
          ...(optionalNumber(draft.employeeRate) !== undefined
            ? { employeeRate: optionalNumber(draft.employeeRate) }
            : {}),
          ...(optionalNumber(draft.employerRate) !== undefined
            ? { employerRate: optionalNumber(draft.employerRate) }
            : {}),
          ...(optionalNumber(draft.wageCeiling) !== undefined
            ? { wageCeiling: optionalNumber(draft.wageCeiling) }
            : {}),
          ...(optionalNumber(draft.employeeThreshold) !== undefined
            ? { employeeThreshold: optionalNumber(draft.employeeThreshold) }
            : {}),
          ...(optionalNumber(draft.flatAmount) !== undefined
            ? { flatAmount: optionalNumber(draft.flatAmount) }
            : {}),
          metadata,
        },
        editingRuleId ?? undefined,
      );
      await rulesResource.refetch();
      setDraft(newRuleDraft());
      setEditingRuleId(null);
      setMutationMessage(
        'Statutory rule saved. Affected calculated payroll runs have been marked stale.',
      );
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Could not save this rule.');
    } finally {
      setSavingRule(false);
    }
  };

  const deleteRule = async (rule: StatutoryRule) => {
    if (!organizationId || !canWrite || !rule.id || savingRule) return;
    setSavingRule(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      await payrollRepository.deleteStatutoryRule(organizationId, rule.id);
      await rulesResource.refetch();
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setDraft(newRuleDraft());
      }
      setMutationMessage(
        'Statutory rule deleted. Affected calculated payroll runs have been marked stale.',
      );
      setRulePendingDelete(null);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Could not delete this rule.');
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="space-y-5">
      <PolicySummary policy={payrollPolicy} />
      <ProfessionalTaxCoveragePanel />
      {(mutationError || mutationMessage) && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${mutationError ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-emerald-700/20 bg-emerald-700/5 text-emerald-800'}`}
          role={mutationError ? 'alert' : 'status'}
        >
          {mutationError ?? mutationMessage}
        </p>
      )}
      <OvertimeRatesCard />
      <AdvanceRulesCard />
      {canWrite && (
        <form
          className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
          onSubmit={(event) => void saveRule(event)}
        >
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {editingRuleId ? 'Edit statutory rule' : 'Add statutory rule'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a rule type, pick a preset or enter your own values, then save.
            </p>
          </div>
          <div className="max-w-sm">
            <Label className="mb-1 block text-xs font-semibold" htmlFor="statutory-scheme">
              1. Rule type
            </Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={savingRule || Boolean(editingRuleId)}
              id="statutory-scheme"
              onChange={(event) =>
                changeScheme(event.target.value as StatutoryRuleDraft['schemeCode'])
              }
              value={draft.schemeCode}
            >
              <option value="EPF">EPF / Provident Fund</option>
              <option value="ESIC">ESI</option>
              <option value="PT">Professional Tax</option>
            </select>
          </div>
          {draft.schemeCode === 'PT' ? (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(220px,0.8fr)_1.2fr] sm:items-end">
              <div>
                <Label className="mb-1 block text-xs font-semibold" htmlFor="pt-state-preset">
                  2. State or territory
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={savingRule}
                  id="pt-state-preset"
                  value={draft.jurisdiction.toUpperCase()}
                  onChange={(event) => {
                    const jurisdiction = event.target.value;
                    const preset = professionalTaxPresetForAutoApply(jurisdiction);
                    if (preset) {
                      applyPreset(preset);
                      return;
                    }
                    setDraft((current) => ({
                      ...newRuleDraft(),
                      schemeCode: 'PT',
                      jurisdiction,
                      effectiveFrom: current.effectiveFrom,
                    }));
                    setMutationError(null);
                    setMutationMessage(
                      'No verified preset is available for this state yet. Enter the official schedule before saving.',
                    );
                  }}
                >
                  <option value="">Choose a state or territory…</option>
                  {draft.jurisdiction &&
                    !INDIA_PAYROLL_JURISDICTIONS.some(
                      (state) => state.toUpperCase() === draft.jurisdiction.toUpperCase(),
                    ) && (
                      <option value={draft.jurisdiction.toUpperCase()}>
                        {draft.jurisdiction} (saved/custom)
                      </option>
                    )}
                  {INDIA_PAYROLL_JURISDICTIONS.map((state) => (
                    <option key={state} value={state.toUpperCase()}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                A verified state schedule fills the amounts below. Other states need an
                admin-verified schedule before payroll can use them.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <span className="mr-1 text-xs text-muted-foreground">2. Fill common rates:</span>
              <Button
                disabled={savingRule}
                onClick={() => applyContributionPreset('EPF')}
                size="sm"
                type="button"
                variant="outline"
              >
                Apply EPFO preset
              </Button>
              <Button
                disabled={savingRule}
                onClick={() => applyContributionPreset('ESIC')}
                size="sm"
                type="button"
                variant="outline"
              >
                Apply ESIC preset
              </Button>
            </div>
          )}
          <div>
            <h4 className="mb-2 text-xs font-semibold text-foreground">3. Confirm details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RuleField
                label="Jurisdiction (e.g. KARNATAKA)"
                name="statutory-jurisdiction"
                list={draft.schemeCode === 'PT' ? 'pt-state-options' : undefined}
                value={draft.jurisdiction}
                onChange={(value) => {
                  updateDraft('jurisdiction', value);
                  if (draft.schemeCode === 'PT') {
                    const match = PROFESSIONAL_TAX_PRESETS.find(
                      (preset) =>
                        preset.jurisdiction.toLocaleLowerCase() ===
                        value.trim().toLocaleLowerCase(),
                    );
                    if (match && professionalTaxPresetForAutoApply(match.jurisdiction))
                      applyPreset(match);
                  }
                }}
                disabled={savingRule}
                type="text"
                required
              />
              {draft.schemeCode === 'PT' && (
                <datalist id="pt-state-options">
                  {PROFESSIONAL_TAX_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.jurisdiction} />
                  ))}
                </datalist>
              )}
              <RuleField
                label="Effective from"
                name="statutory-effective-from"
                value={draft.effectiveFrom}
                onChange={(value) => updateDraft('effectiveFrom', value)}
                disabled={savingRule}
                type="date"
                required
              />
              <RuleField
                label="Effective to (optional)"
                name="statutory-effective-to"
                value={draft.effectiveTo}
                onChange={(value) => updateDraft('effectiveTo', value)}
                disabled={savingRule}
                type="date"
              />
              {draft.schemeCode !== 'PT' && (
                <>
                  <RuleField
                    label="Employee rate (%)"
                    name="statutory-employee-rate"
                    value={draft.employeeRate}
                    onChange={(value) => updateDraft('employeeRate', value)}
                    disabled={savingRule}
                    type="number"
                    max={100}
                    required
                  />
                  <RuleField
                    label="Employer rate (%)"
                    name="statutory-employer-rate"
                    value={draft.employerRate}
                    onChange={(value) => updateDraft('employerRate', value)}
                    disabled={savingRule}
                    type="number"
                    max={100}
                    required
                  />
                </>
              )}
            </div>
          </div>
          {draft.schemeCode !== 'PT' && (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                Optional coverage limits
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RuleField
                  label="Wage ceiling (optional)"
                  name="statutory-wage-ceiling"
                  value={draft.wageCeiling}
                  onChange={(value) => updateDraft('wageCeiling', value)}
                  disabled={savingRule}
                  type="number"
                />
                <RuleField
                  label="Coverage threshold (optional)"
                  name="statutory-employee-threshold"
                  value={draft.employeeThreshold}
                  onChange={(value) => updateDraft('employeeThreshold', value)}
                  disabled={savingRule}
                  type="number"
                />
              </div>
            </details>
          )}
          {draft.schemeCode === 'PT' && (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                Optional flat or percentage tax instead of salary bands
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RuleField
                  label="Percentage rate (optional)"
                  name="statutory-employee-rate"
                  value={draft.employeeRate}
                  onChange={(value) => updateDraft('employeeRate', value)}
                  disabled={savingRule}
                  max={100}
                  type="number"
                />
                <RuleField
                  label="Flat monthly amount (optional)"
                  name="statutory-flat-amount"
                  value={draft.flatAmount}
                  onChange={(value) => updateDraft('flatAmount', value)}
                  disabled={savingRule}
                  type="number"
                />
              </div>
            </details>
          )}
          {draft.schemeCode === 'PT' && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    4. Salary bands and tax amount
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Enter inclusive salary ranges. Leave “Through” blank for no upper limit.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Label className="sr-only" htmlFor="pt-salary-basis">
                    Salary band unit
                  </Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    id="pt-salary-basis"
                    value={draft.salaryBasis}
                    onChange={(event) => updateDraft('salaryBasis', event.target.value)}
                  >
                    <option value="MONTHLY">Monthly salary bands</option>
                    <option value="ANNUAL">Annual salary bands</option>
                    <option value="HALF_YEARLY">Half-yearly income bands</option>
                  </select>
                  <Label className="sr-only" htmlFor="pt-amount-basis">
                    Tax amount unit
                  </Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    id="pt-amount-basis"
                    value={draft.amountBasis}
                    onChange={(event) => updateDraft('amountBasis', event.target.value)}
                  >
                    <option value="MONTHLY">Monthly tax amount</option>
                    <option value="ANNUAL">Annual tax amount (accrued monthly)</option>
                    <option value="HALF_YEARLY">Half-yearly tax (accrued monthly)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                {readSlabs(draft.slabs).map((row, index, rows) => (
                  <div
                    className="grid grid-cols-2 gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                    key={`pt-slab-${index}`}
                  >
                    {(
                      [
                        [
                          'min',
                          `From (${draft.salaryBasis === 'ANNUAL' ? '₹/year' : draft.salaryBasis === 'HALF_YEARLY' ? '₹/half-year' : '₹/month'})`,
                        ],
                        ['max', 'Through (blank = no cap)'],
                        [
                          'amount',
                          `Tax (${draft.amountBasis === 'ANNUAL' ? '₹/year' : draft.amountBasis === 'HALF_YEARLY' ? '₹/half-year' : '₹/month'})`,
                        ],
                        [
                          'february',
                          `February override (${draft.amountBasis === 'ANNUAL' ? '₹/year' : draft.amountBasis === 'HALF_YEARLY' ? '₹/half-year' : '₹/month'})`,
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <Label
                          className="mb-1 block text-[10px] font-medium"
                          htmlFor={`pt-slab-${index}-${key}`}
                        >
                          {label}
                        </Label>
                        <Input
                          className="h-9 text-xs"
                          disabled={savingRule}
                          id={`pt-slab-${index}-${key}`}
                          min={0}
                          onChange={(event) => {
                            const next = [...rows];
                            next[index] = { ...row, [key]: event.target.value };
                            updateDraft('slabs', writeSlabs(next));
                          }}
                          step="any"
                          type="number"
                          value={row[key]}
                        />
                      </div>
                    ))}
                    <Button
                      aria-label={`Remove salary band ${index + 1}`}
                      className="self-end"
                      disabled={savingRule}
                      onClick={() =>
                        updateDraft(
                          'slabs',
                          writeSlabs(rows.filter((_, rowIndex) => rowIndex !== index)),
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  disabled={savingRule}
                  onClick={() =>
                    updateDraft(
                      'slabs',
                      writeSlabs([
                        ...readSlabs(draft.slabs),
                        { min: '', max: '', amount: '', february: '' },
                      ]),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Add salary band
                </Button>
              </div>
              {draft.sourceUrl && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="inline cursor-pointer font-medium text-primary underline">
                    View source and notes
                  </summary>
                  <p className="mt-2 leading-relaxed">
                    {draft.sourceLabel}. {draft.sourceNote}{' '}
                    <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
                      Open source
                    </a>
                  </p>
                </details>
              )}
            </div>
          )}
          {draft.schemeCode !== 'PT' && draft.sourceUrl && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="inline cursor-pointer font-medium text-primary underline">
                View source and notes
              </summary>
              <p className="mt-2 leading-relaxed">
                {draft.sourceLabel}. {draft.sourceNote}{' '}
                <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
                  Open source
                </a>
              </p>
            </details>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {editingRuleId && (
              <Button
                disabled={savingRule}
                onClick={() => {
                  setEditingRuleId(null);
                  setDraft(newRuleDraft());
                  setMutationError(null);
                  setMutationMessage(null);
                }}
                type="button"
                variant="outline"
              >
                Cancel edit
              </Button>
            )}
            <Button disabled={savingRule} type="submit">
              {savingRule ? 'Saving…' : editingRuleId ? 'Update rule' : 'Add rule'}
            </Button>
          </div>
        </form>
      )}
      <RulesTable
        canWrite={canWrite}
        onDelete={setRulePendingDelete}
        onEdit={editRule}
        rules={rulesResource.data ?? []}
      />
      <ConfirmDialog
        open={Boolean(rulePendingDelete)}
        title="Delete statutory rule?"
        description={
          rulePendingDelete
            ? `Delete the ${rulePendingDelete.schemeCode} rule for ${rulePendingDelete.jurisdiction}? Affected calculated payroll runs will be marked stale.`
            : ''
        }
        confirmText="Delete rule"
        onCancel={() => setRulePendingDelete(null)}
        onConfirm={() => {
          if (rulePendingDelete) void deleteRule(rulePendingDelete);
        }}
      />
    </div>
  );
}

function RuleField({
  label,
  name,
  value,
  onChange,
  disabled,
  required = false,
  type = 'number',
  max,
  list,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required?: boolean;
  type?: 'number' | 'date' | 'text';
  max?: number;
  list?: string;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-semibold" htmlFor={name}>
        {label}
      </Label>
      <Input
        className="h-10 font-mono text-sm"
        disabled={disabled}
        id={name}
        list={list}
        max={max}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        step={type === 'number' ? 'any' : undefined}
        type={type}
        value={value}
      />
    </div>
  );
}
