'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@smarteam/ui';
import { formatMoney, isCalculationStale, type PayrollRun } from '@smarteam/contracts';
import type { PayrollAdminState } from '../../hooks/use-payroll-admin';
import {
  AddAdjustmentDialog,
  CreatePayrollRunDialog,
  PayrollRunActions,
} from './payroll-run-actions';

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Figures come from attendance, leave, approved timesheets, salary structure and statutory
          rules.
        </p>
        {admin.can.write && (
          <Button onClick={() => setCreating(true)} size="sm" type="button">
            Start a run
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
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading payroll runs...
        </p>
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
            Start a run for a period to calculate pay for that month.
          </p>
        </div>
      )}

      {!admin.loading &&
        !admin.error &&
        admin.runs.map((run) => {
          const slips = admin.payslipsForRun(run.id);
          const released = run.status === 'RELEASED' || run.status === 'LOCKED';
          const totals = slips.reduce(
            (sum, slip) => ({
              gross: sum.gross + slip.totals.grossAmount,
              deduction: sum.deduction + slip.totals.deductionAmount,
              net: sum.net + slip.totals.netAmount,
            }),
            { gross: 0, deduction: 0, net: 0 },
          );
          return (
            <div className="rounded-lg border border-border bg-card" key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {run.periodStart.slice(0, 10)} to {run.periodEnd.slice(0, 10)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {run.calculatedAt
                      ? `Calculated ${run.calculatedAt.slice(0, 10)}`
                      : 'Not calculated yet'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={statusTone(run)}>
                    {isCalculationStale(run) ? 'needs recalculation' : run.status.toLowerCase()}
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

              {isCalculationStale(run) && (
                <p className="border-t border-border bg-muted/30 px-4 py-2.5 text-[11px] text-foreground">
                  An input changed after this run was calculated. It cannot be approved or released
                  until it is calculated again.
                </p>
              )}

              {released && !admin.payslipsUnavailable && (
                <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
                  {[
                    { label: 'Employees paid', value: String(slips.length) },
                    { label: 'Gross', value: formatMoney(totals.gross) },
                    { label: 'Deductions', value: formatMoney(totals.deduction) },
                    { label: 'Net', value: formatMoney(totals.net) },
                  ].map((tile) => (
                    <div className="bg-card px-4 py-2.5" key={tile.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {tile.label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-xs font-bold text-foreground">
                        {tile.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {released && admin.payslipsUnavailable && (
                <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                  Run totals need permission to read every employee&apos;s payslips.
                </p>
              )}

              {!released && run.status !== 'DRAFT' && (
                <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                  Per-employee figures become available once the run is released.
                </p>
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
