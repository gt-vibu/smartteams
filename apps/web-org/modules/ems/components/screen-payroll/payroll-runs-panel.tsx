'use client';
import { PayrollReadinessPanel } from './payroll-readiness-panel';

import React, { useState } from 'react';
import { LoadingIndicator, Badge, Button } from '@smarteam/ui';
import {
  formatDate,
  formatDateRange,
  formatMoney,
  isCalculationStale,
  type PayrollRun,
} from '@smarteam/contracts';
import type { PayrollAdminState } from '../../hooks/use-payroll-admin';
import {
  AddAdjustmentDialog,
  CreatePayrollRunDialog,
  PayrollRunActions,
} from './payroll-run-actions';
import { hasNetPayableAmount, PayrollRunBreakdown } from './payroll-run-breakdown';
import { PayrollRunExports } from './payroll-run-exports';
import { PayrollRunReview } from './payroll-run-review';
import { statusLabel } from '../../lib/status-label';
import { Card, CardContent, CardHeader, CardTitle } from '@smarteam/ui';
import { ArrowDownRight, ArrowUpRight, IndianRupee, Users } from 'lucide-react';

/**
 * Payroll runs for the organisation.
 *
 * Totals are shown only for a released run, because payslips are the only per-employee figures
 * the native API exposes: `PayrollService.ledger` would give line items for a calculated run, but
 * it is reachable through federation alone. Rather than invent a register, a calculated run says
 * so — the gap is recorded in `docs/backend-gaps.md`.
 */

const statusTone = (run: PayrollRun) => {
  if (isCalculationStale(run)) return 'warning' as const;
  if (run.status === 'RELEASED' || run.status === 'LOCKED') return 'success' as const;
  if (run.status === 'APPROVED' || run.status === 'CALCULATED') return 'sky' as const;
  return 'secondary' as const;
};

export function PayrollRunsPanel({ admin }: { admin: PayrollAdminState }) {
  const [creating, setCreating] = useState(false);
  const [adjustingRunId, setAdjustingRunId] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const releasedRuns = admin.runs
    .filter((run) => run.status === 'RELEASED' || run.status === 'LOCKED')
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const trend = releasedRuns.slice(0, 6).reverse().map((run) => {
    const slips = admin.payslipsForRun(run.id);
    return {
      run,
      label: new Date(`${run.periodStart.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      employees: slips.length,
      gross: slips.reduce((total, slip) => total + slip.totals.grossAmount, 0),
      deductions: slips.reduce((total, slip) => total + slip.totals.deductionAmount, 0),
      net: slips.reduce((total, slip) => total + slip.totals.netAmount, 0),
    };
  });

  if (admin.forbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to view payroll runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!admin.payslipsUnavailable && (
        <PayrollRunsOverview
          loading={admin.loading}
          rows={trend}
          onOpenRun={(runId) => {
            setOpenRunId(runId);
            requestAnimationFrame(() => document.getElementById(`payroll-run-${runId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold tracking-tight">Pay runs</h2><p className="text-xs text-muted-foreground">Review monthly payroll, approvals and release status.</p></div>
        {admin.can.write && (
          <Button onClick={() => setCreating(true)} size="sm" type="button">
            Create pay run
          </Button>
        )}
      </div>

      {admin.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {admin.saveError}
        </p>
      )}

      {admin.loading && (
        <LoadingIndicator variant="panel" label="Loading payroll runs" className="py-10 text-center text-xs text-muted-foreground" />
      )}

      {!admin.loading && admin.error && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-sm font-bold text-foreground">Could not load payroll runs</p>
          <p className="mt-1 text-xs text-muted-foreground">{admin.error}</p>
          <Button
            className="mt-3"
            onClick={() => void admin.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!admin.loading && !admin.error && admin.runs.length === 0 && (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-bold text-foreground">No payroll runs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a pay run for a month to calculate pay for it.
          </p>
        </div>
      )}

      {!admin.loading &&
        !admin.error &&
        admin.runs.map((run) => {
          const slips = admin.payslipsForRun(run.id);
          const released = run.status === 'RELEASED' || run.status === 'LOCKED';
          const payableCount = slips.filter(hasNetPayableAmount).length;
          const noPayCount = slips.length - payableCount;
          const showing = openRunId === run.id;
          const totals = slips.reduce(
            (sum, slip) => ({
              gross: sum.gross + slip.totals.grossAmount,
              deduction: sum.deduction + slip.totals.deductionAmount,
              net: sum.net + slip.totals.netAmount,
            }),
            { gross: 0, deduction: 0, net: 0 },
          );
          return (
            <div className="rounded-xl border border-border bg-card shadow-sm" id={`payroll-run-${run.id}`} key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {formatDateRange(run.periodStart, run.periodEnd)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {run.calculatedAt
                      ? `Calculated ${formatDate(run.calculatedAt)}`
                      : 'Not calculated yet'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={statusTone(run)}>
                    {isCalculationStale(run) ? 'Needs recalculation' : statusLabel(run.status)}
                  </Badge>
                  {admin.can.adjust && (run.status === 'DRAFT' || run.status === 'CALCULATED') && (
                    <Button
                      onClick={() => setAdjustingRunId(run.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Add bonus
                    </Button>
                  )}
                  <PayrollRunActions admin={admin} run={run} />
                </div>
              </div>

              <PayrollReadinessPanel runId={run.id} />
              {isCalculationStale(run) && (
                <p className="border-t border-border bg-muted/30 px-4 py-2.5 text-[11px] text-foreground">
                  An input changed after this run was calculated. It cannot be approved or released
                  until it is calculated again.
                </p>
              )}

              {released && !admin.payslipsUnavailable && (
                <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
                  {[
                    {
                      label: 'Employees with net pay',
                      value: noPayCount ? `${payableCount} of ${slips.length}` : String(payableCount),
                    },
                    { label: 'Gross', value: formatMoney(totals.gross) },
                    { label: 'Deductions', value: formatMoney(totals.deduction) },
                    { label: 'Net', value: formatMoney(totals.net) },
                  ].map((tile) => (
                    <div className="bg-card px-4 py-2.5" key={tile.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {tile.label}
                      </dt>
                      <dd className="mt-0.5 tabular-nums text-xs font-bold text-foreground">
                        {tile.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {released && !admin.payslipsUnavailable && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
                    <p className="text-[11px] text-muted-foreground">
                      {noPayCount > 0
                        ? `${noPayCount} employee${noPayCount === 1 ? ' has' : 's have'} no net pay this period.`
                        : 'Released means payslips were issued; it does not confirm bank payment.'}
                    </p>
                    {noPayCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Released means payslips were issued; bank payment is tracked separately.
                      </span>
                    )}
                    <Button
                      aria-expanded={showing}
                      onClick={() => setOpenRunId(showing ? null : run.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {showing ? 'Hide breakdown' : 'View breakdown'}
                    </Button>
                  </div>
                  {showing && <PayrollRunBreakdown slips={slips} />}
                  <PayrollRunExports canPay={admin.can.pay} runId={run.id} />
                </>
              )}

              {released && admin.payslipsUnavailable && (
                <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                  Run totals need permission to read every employee&apos;s payslips.
                </p>
              )}

              {!released && run.calculatedAt && !admin.payslipsUnavailable && (
                <PayrollRunReview calculatedAt={run.calculatedAt} runId={run.id} />
              )}
            </div>
          );
        })}

      <CreatePayrollRunDialog admin={admin} onOpenChange={setCreating} open={creating} />
      {adjustingRunId && (
        <AddAdjustmentDialog
          admin={admin}
          onOpenChange={(open) => !open && setAdjustingRunId(null)}
          open
          runId={adjustingRunId}
        />
      )}
    </div>
  );
}

type PayrollTrendRow = {
  run: PayrollRun;
  label: string;
  employees: number;
  gross: number;
  deductions: number;
  net: number;
};

function PayrollRunsOverview({
  loading,
  rows,
  onOpenRun,
}: {
  loading: boolean;
  rows: PayrollTrendRow[];
  onOpenRun: (runId: string) => void;
}) {
  const latest = rows.at(-1);
  const max = Math.max(1, ...rows.flatMap((row) => [row.gross, row.deductions, row.net]));
  const cards = [
    { label: 'Total gross', value: latest ? formatMoney(latest.gross) : '—', caption: latest?.label ?? 'No released payroll yet', icon: IndianRupee, tone: 'text-emerald-800 bg-emerald-100' },
    { label: 'Total deductions', value: latest ? formatMoney(latest.deductions) : '—', caption: latest?.label ?? 'No released payroll yet', icon: ArrowDownRight, tone: 'text-orange-800 bg-orange-100' },
    { label: 'Net payable', value: latest ? formatMoney(latest.net) : '—', caption: latest?.label ?? 'No released payroll yet', icon: ArrowUpRight, tone: 'text-sky-800 bg-sky-100' },
    { label: 'Employees processed', value: latest ? latest.employees.toLocaleString() : '—', caption: latest ? `From ${latest.label}` : 'Appears after payroll release', icon: Users, tone: 'text-violet-800 bg-violet-100' },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <Card className="xl:col-span-8">
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
          <div><CardTitle>Payroll cost trend</CardTitle><p className="mt-1 text-xs text-muted-foreground">Released payroll · gross, deductions and take-home</p></div>
          <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-800" />Gross</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-orange-400" />Deductions</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-300" />Net</span></div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="h-36 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? <div className="grid h-36 place-items-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">Released payroll totals will appear here after the first payroll run.</div> : (
            <div className="grid h-36 grid-cols-6 items-end gap-2 border-b border-border bg-[repeating-linear-gradient(to_top,transparent_0,transparent_35px,hsl(var(--border)/.65)_36px)] px-2 pt-4">
              {rows.map((row) => <button aria-label={`${row.label}: gross ${formatMoney(row.gross)}, deductions ${formatMoney(row.deductions)}, net ${formatMoney(row.net)}`} className="group flex h-full min-w-0 flex-col items-center justify-end gap-1.5 rounded-t-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" key={row.run.id} onClick={() => onOpenRun(row.run.id)} title={`${row.employees} employees processed`}>
                <span className="flex h-[80%] w-full max-w-12 items-end justify-center gap-0.5">
                  {[['gross', row.gross, 'bg-emerald-800'], ['deductions', row.deductions, 'bg-orange-400'], ['net', row.net, 'bg-emerald-300']].map(([name, value, color]) => <i key={String(name)} className={`w-1/4 min-w-1 rounded-t-sm opacity-90 transition group-hover:opacity-100 ${color}`} style={{ height: `${Math.max(3, (Number(value) / max) * 100)}%` }} />)}
                </span>
                <span className="max-w-full truncate text-[10px] text-muted-foreground">{row.label}</span>
              </button>)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-4">
        <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle>Payroll readiness</CardTitle>{latest && <span className="text-[11px] text-muted-foreground">{latest.label}</span>}</div></CardHeader>
        <CardContent>{loading ? <div className="h-36 animate-pulse rounded-lg bg-muted" /> : latest ? <><div className="mb-2 flex items-center justify-between text-xs"><span>Latest released period</span><b>{latest.employees.toLocaleString()} employees</b></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-full rounded-full bg-emerald-700" /></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Released payroll totals are drawn from the payslips for this period. Select the chart to open its run details.</p><button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => onOpenRun(latest.run.id)}>Open latest run →</button></> : <p className="py-7 text-center text-xs text-muted-foreground">Create a payroll run to see readiness and processing details.</p>}</CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 xl:col-span-8 xl:grid-cols-4">
        {cards.map(({ label, value, caption, icon: Icon, tone }) => <button type="button" key={label} onClick={() => latest && onOpenRun(latest.run.id)} disabled={!latest} className="rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md disabled:cursor-default disabled:hover:border-border disabled:hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span><span className="mt-2 block text-[11px] font-medium text-muted-foreground">{label}</span><b className="mt-0.5 block truncate text-base tabular-nums">{loading ? '…' : value}</b><small className="mt-0.5 block text-[10px] text-muted-foreground">{caption}</small></button>)}
      </div>
    </div>
  );
}
