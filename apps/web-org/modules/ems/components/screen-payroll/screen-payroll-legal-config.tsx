'use client';

import React, { useMemo } from 'react';
import { Badge, Button } from '@smarteam/ui';
import {
  formatMoney,
  hasPermission,
  type PayrollPolicy,
  type StatutoryRule,
} from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { payrollRepository } from '../../repositories/payroll.repository';
import { useAsyncResource } from '../../hooks/use-async-resource';

/**
 * The statutory rules and payroll policy the backend actually applies.
 *
 * Replaces a screen backed by `statutory-rules.json` and `localStorage`, which presented a
 * catalogue of PF, ESI and professional-tax rates, per-state PT slabs and company registration
 * numbers as if they were configuration. None of it reached a payroll calculation: the browser
 * held it, and the run priced its deductions from `PayrollStatutoryRule` rows it had never seen.
 *
 * PAN, TAN, EPF/ESI/PT registration codes, tax regime and gratuity have no backend field at all,
 * so they are not shown. Editing rules is not offered here because it is a policy-write action
 * that belongs with the rest of payroll configuration, not a display screen.
 */

const rate = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : `${value}%`;

const amount = (value: number | null | undefined) =>
  value === null || value === undefined ? '--' : formatMoney(value);

function PolicySummary({ policy }: { policy: PayrollPolicy }) {
  const rows = [
    { label: 'Day basis', value: String(policy.payrollDayBasis) },
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
          { label: 'Salary slips', on: policy.salarySlipDefault },
        ].map((flag) => (
          <Badge key={flag.label} variant={flag.on ? 'success' : 'secondary'}>
            {flag.label} {flag.on ? 'on by default' : 'off by default'}
          </Badge>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        These defaults apply to an employee with no policy of their own. Whether a scheme is legally
        applicable is decided by the backend from the rule&apos;s threshold and ceiling — a switch
        here cannot remove a deduction an employee is covered by.
      </p>
    </div>
  );
}

function RulesTable({ rules }: { rules: StatutoryRule[] }) {
  if (rules.length === 0) {
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-bold text-foreground">No statutory rules configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Payroll applies no PF, ESI or professional-tax deduction until a rule exists.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[820px] text-left text-xs">
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
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={rule.id ?? `${rule.schemeCode}-${rule.jurisdiction}-${rule.effectiveFrom}`}
            >
              <td className="px-4 py-2.5 font-semibold text-foreground">{rule.schemeCode}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{rule.jurisdiction}</td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {rule.effectiveFrom.slice(0, 10)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                {rate(rule.employeeRate)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                {rate(rule.employerRate)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                {amount(rule.wageCeiling)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                {amount(rule.employeeThreshold)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                {amount(rule.flatAmount)}
              </td>
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

  return (
    <div className="space-y-5">
      <PolicySummary policy={policyResource.data} />
      <RulesTable rules={rulesResource.data ?? []} />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Company registration identifiers (PAN, TAN, EPF, ESI and professional-tax codes), tax regime
        and gratuity are not stored by the backend and are therefore not shown. Income tax is not
        calculated by payroll.
      </p>
    </div>
  );
}
