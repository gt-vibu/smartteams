'use client';

import { useMemo, useState } from 'react';
import { Button, ConfirmDialog, Input, Label } from '@smarteam/ui';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import {
  payrollRepository,
  type PayrollRuleUpdateProposal,
  type PayrollRuleUpdates,
} from '../../repositories/payroll.repository';

type RuleDraft = {
  effectiveFrom: string;
  employeeRate: string;
  employerRate: string;
  wageCeiling: string;
  employeeThreshold: string;
  flatAmount: string;
  metadata: string;
};

const dateToday = () => new Date().toISOString().slice(0, 10);
const defaultDraft = (proposal: PayrollRuleUpdateProposal): RuleDraft => {
  const current = proposal.proposedRule ?? proposal.currentRule ?? {};
  return {
    effectiveFrom: proposal.effectiveFrom?.slice(0, 10) ?? dateToday(),
    employeeRate: value(current.employeeRate),
    employerRate: value(current.employerRate),
    wageCeiling: value(current.wageCeiling),
    employeeThreshold: value(current.employeeThreshold),
    flatAmount: value(current.flatAmount),
    metadata:
      current.metadata && typeof current.metadata === 'object'
        ? JSON.stringify(current.metadata, null, 2)
        : '',
  };
};
const value = (input: unknown) => {
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean') return `${input}`;
  return '';
};

function ruleRows(rule: Record<string, unknown> | null) {
  if (!rule) return [{ label: 'Current rule', value: 'No matching saved rule' }];
  return [
    {
      label: 'Employee rate',
      value: rule.employeeRate == null ? '—' : `${value(rule.employeeRate)}%`,
    },
    {
      label: 'Employer rate',
      value: rule.employerRate == null ? '—' : `${value(rule.employerRate)}%`,
    },
    {
      label: 'Wage ceiling',
      value: rule.wageCeiling == null ? '—' : `₹${value(rule.wageCeiling)}`,
    },
    {
      label: 'Employee threshold',
      value: rule.employeeThreshold == null ? '—' : `₹${value(rule.employeeThreshold)}`,
    },
    { label: 'Flat amount', value: rule.flatAmount == null ? '—' : `₹${value(rule.flatAmount)}` },
    { label: 'Effective from', value: value(rule.effectiveFrom) || '—' },
    { label: 'Effective to', value: value(rule.effectiveTo) || 'Open-ended' },
    ...(rule.metadata && typeof rule.metadata === 'object' && 'slabs' in rule.metadata
      ? [{ label: 'PT slab schedule', value: JSON.stringify(rule.metadata.slabs) }]
      : []),
  ];
}

export function PayrollRuleUpdatesCard({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'payroll.policy.read');
  const canWrite = hasPermission(permissions, 'payroll.policy.write');
  const resource = useAsyncResource<PayrollRuleUpdates>(
    () => payrollRepository.listRuleUpdates(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    proposal: PayrollRuleUpdateProposal;
    action: 'accept' | 'reject';
  } | null>(null);
  const proposals = resource.data?.proposals ?? [];

  if (!canRead) return null;

  const getDraft = (proposal: PayrollRuleUpdateProposal) =>
    drafts[proposal.id] ?? defaultDraft(proposal);
  const changeDraft = (proposal: PayrollRuleUpdateProposal, key: keyof RuleDraft, next: string) => {
    setDrafts((current) => ({ ...current, [proposal.id]: { ...getDraft(proposal), [key]: next } }));
  };
  const runSync = async () => {
    if (!organizationId || checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const { jobId } = await payrollRepository.syncRuleSources(organizationId);
      setMessage('Syncing official payroll rules for the configured jurisdictions…');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await payrollRepository.getRuleSyncStatus(organizationId, jobId);
        if (status.state === 'completed') {
          await resource.refetch();
          const changed = status.result?.changed ?? 0;
          const failed = status.result?.failed ?? 0;
          const checked = status.result?.checked ?? 0;
          setMessage(
            failed
              ? `Sync finished: ${checked} official page${checked === 1 ? '' : 's'} checked and ${failed} could not be reached. See the status below; payroll values were not changed.`
              : changed
                ? `Sync finished: ${changed} possible change${changed === 1 ? '' : 's'} found. Review the update below; payroll values were not changed.`
                : `Sync finished: ${checked} official page${checked === 1 ? '' : 's'} checked. No possible changes were found.`,
          );
          return;
        }
        if (status.state === 'failed')
          throw new Error(status.failedReason || 'The source check failed.');
      }
      await resource.refetch();
      setMessage(
        'The source check is still running. Refresh this panel shortly to see its result.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start source check.');
    } finally {
      setChecking(false);
    }
  };
  const prepare = async (proposal: PayrollRuleUpdateProposal) => {
    if (!organizationId) return;
    const draft = getDraft(proposal);
    setBusyId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      const metadata = draft.metadata.trim()
        ? (JSON.parse(draft.metadata) as Record<string, unknown>)
        : undefined;
      const number = (text: string) => (text.trim() ? Number(text) : undefined);
      await payrollRepository.prepareRuleUpdate(organizationId, proposal.id, {
        schemeCode: proposal.schemeCode,
        jurisdiction: proposal.jurisdiction,
        effectiveFrom: draft.effectiveFrom,
        employeeRate: number(draft.employeeRate),
        employerRate: number(draft.employerRate),
        wageCeiling: number(draft.wageCeiling),
        employeeThreshold: number(draft.employeeThreshold),
        flatAmount: number(draft.flatAmount),
        metadata,
      });
      await resource.refetch();
      setMessage(`Verified ${proposal.schemeCode} values are ready for review.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not save the review details. Check the values and slab JSON.',
      );
    } finally {
      setBusyId(null);
    }
  };
  const decide = async () => {
    if (!organizationId || !decision) return;
    const { proposal, action } = decision;
    setBusyId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      if (action === 'accept')
        await payrollRepository.acceptRuleUpdate(organizationId, proposal.id);
      else await payrollRepository.rejectRuleUpdate(organizationId, proposal.id);
      await Promise.all([resource.refetch(), ...(action === 'accept' ? [onAccepted()] : [])]);
      setMessage(
        action === 'accept'
          ? `Rule accepted for ${proposal.jurisdiction}. Future matching payroll runs may need recalculation.`
          : 'Proposal rejected. No payroll values were changed.',
      );
      setDecision(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} this proposal.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
      aria-labelledby="payroll-rule-updates-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="payroll-rule-updates-title" className="text-sm font-bold text-foreground">
            Government rule sync
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Smarteam checks the official payroll pages for enabled rules in the background. EPF and
            ESIC are nationwide; Professional Tax checks only the states configured for this
            organization and its employees. Potential changes appear here for review. Payroll values
            change only after an admin approves them.
          </p>
        </div>
        {canWrite && (
          <Button
            disabled={checking}
            onClick={() => void runSync()}
            size="sm"
            type="button"
            variant="outline"
          >
            {checking ? 'Syncing rules…' : 'Sync rules now'}
          </Button>
        )}
      </div>
      {resource.loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading sync status…
        </p>
      )}
      {resource.error && (
        <p role="alert" className="text-xs text-destructive">
          Could not load government rule sync status: {resource.error}
        </p>
      )}
      {(error || message) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`rounded-md border px-3 py-2 text-xs ${error ? 'border-destructive/30 text-destructive' : 'border-emerald-700/20 text-emerald-800'}`}
        >
          {error ?? message}
        </p>
      )}
      {resource.data?.unsupportedJurisdictions.length ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Smarteam cannot check Professional Tax for {resource.data.unsupportedJurisdictions.join(', ')}
          yet. It will not use another state’s rules.
        </p>
      ) : null}
      {!!resource.data?.sources.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {resource.data.sources.map((source) => {
            const check = resource.data?.checks.find((item) => item.sourceKey === source.key);
            return (
              <div
                key={source.key}
                className="min-w-0 rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <strong>
                    {source.schemeCode} · {source.jurisdiction}
                  </strong>
                  <span className={check?.lastError ? 'text-destructive' : 'text-muted-foreground'}>
                    {check?.lastError
                      ? 'Could not sync'
                      : check?.checkedAt
                        ? `Synced ${new Date(check.checkedAt).toLocaleDateString()}`
                        : 'Not synced yet'}
                  </span>
                </div>
                {check?.lastError && <p className="mt-1 text-destructive">{check.lastError}</p>}
                {check?.sourceChangedAt && (
                  <p className="mt-1 text-muted-foreground">
                    A page changed on {new Date(check.sourceChangedAt).toLocaleDateString()}.
                    Review the update below.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {proposals.length === 0 && resource.data && (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No possible rule changes are waiting for review.
        </p>
      )}
      {proposals.map((proposal) => {
        const draft = getDraft(proposal);
        const currentRows = ruleRows(proposal.currentRule);
        const changed = ruleRows(proposal.proposedRule);
        const impact = proposal.impactPreview ?? {};
        const isPending = ['NEEDS_REVIEW', 'READY'].includes(proposal.status);
        return (
          <article
            key={proposal.id}
            className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">
                    {proposal.schemeCode} · {proposal.jurisdiction}
                  </strong>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {proposal.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{proposal.changeSummary}</p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <RuleSnapshot title="Currently saved" rows={currentRows} />
              <RuleSnapshot
                title="Proposed replacement"
                rows={changed}
                empty={!proposal.proposedRule}
              />
            </div>
            {isPending && canWrite && (
              <div className="space-y-3 rounded-md border border-border bg-background p-3">
                <p className="text-xs font-semibold">
                  Confirm the official values and effective date
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Verify the current government rule, its scope, salary basis, exemptions, and
                  effective date before saving. A page change can include unrelated content and does
                  not by itself prove that payroll rates changed.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    label="Effective from"
                    value={draft.effectiveFrom}
                    type="date"
                    onChange={(next) => changeDraft(proposal, 'effectiveFrom', next)}
                  />
                  <Field
                    label="Employee rate (%)"
                    value={draft.employeeRate}
                    onChange={(next) => changeDraft(proposal, 'employeeRate', next)}
                  />
                  <Field
                    label="Employer rate (%)"
                    value={draft.employerRate}
                    onChange={(next) => changeDraft(proposal, 'employerRate', next)}
                  />
                  <Field
                    label="Wage ceiling (₹)"
                    value={draft.wageCeiling}
                    onChange={(next) => changeDraft(proposal, 'wageCeiling', next)}
                  />
                  <Field
                    label="Employee threshold (₹)"
                    value={draft.employeeThreshold}
                    onChange={(next) => changeDraft(proposal, 'employeeThreshold', next)}
                  />
                  <Field
                    label="Flat amount (₹)"
                    value={draft.flatAmount}
                    onChange={(next) => changeDraft(proposal, 'flatAmount', next)}
                  />
                </div>
                {proposal.schemeCode === 'PT' && (
                  <div>
                    <Label
                      className="mb-1 block text-xs"
                      htmlFor={`proposal-metadata-${proposal.id}`}
                    >
                      PT slabs and month overrides (JSON)
                    </Label>
                    <textarea
                      id={`proposal-metadata-${proposal.id}`}
                      className="min-h-28 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                      value={draft.metadata}
                      onChange={(event) => changeDraft(proposal, 'metadata', event.target.value)}
                      placeholder={'{"slabs":[{"min":0,"max":null,"amount":0}]}'}
                    />
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    disabled={busyId === proposal.id}
                    onClick={() => void prepare(proposal)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {busyId === proposal.id ? 'Saving…' : 'Preview and save values'}
                  </Button>
                  {proposal.status === 'READY' && (
                    <>
                      <Button
                        disabled={busyId === proposal.id}
                        onClick={() => setDecision({ proposal, action: 'reject' })}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Reject
                      </Button>
                      <Button
                        disabled={busyId === proposal.id}
                        onClick={() => setDecision({ proposal, action: 'accept' })}
                        size="sm"
                        type="button"
                      >
                        Accept and apply
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            {proposal.proposedRule && proposal.impactPreview && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                <strong>What acceptance does</strong>
                <p className="mt-1 text-muted-foreground">{value(impact.summary)}</p>
                <p className="mt-1 text-muted-foreground">
                  Up to {value(impact.employeesPotentiallyAffected) || '0'} employees may be in
                  scope · {value(impact.calculatedRunsToRecalculate) || '0'} calculated/approved
                  runs fall on or after the effective date · released runs changed: 0.
                </p>
              </div>
            )}
          </article>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Next automatic check:{' '}
        {resource.data?.nextAutomaticCheck
          ? new Date(resource.data.nextAutomaticCheck).toLocaleDateString()
          : 'monthly'}
        .
      </p>
      <ConfirmDialog
        open={Boolean(decision)}
        title={
          decision?.action === 'accept' ? 'Apply this verified rule?' : 'Reject this source change?'
        }
        description={
          decision?.action === 'accept'
            ? 'This adds a dated statutory rule after closing the prior rule at the day before the effective date. Matching future calculated payroll runs are marked stale for recalculation. Released payroll and prior payslips remain unchanged.'
            : 'Rejecting closes this review item and does not change any payroll rule.'
        }
        confirmText={decision?.action === 'accept' ? 'Accept and apply' : 'Reject proposal'}
        onCancel={() => setDecision(null)}
        onConfirm={() => void decide()}
      />
    </section>
  );
}

function RuleSnapshot({
  title,
  rows,
  empty = false,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  empty?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="mb-2 text-xs font-semibold">{title}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground">Enter values verified against the source.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="break-all text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  type = 'number',
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input
        min={type === 'number' ? 0 : undefined}
        step="any"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
