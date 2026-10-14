'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney, type Payslip } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { downloadPayslipPdf } from '../../lib/payslip-pdf';
import { orgPath } from '../../repositories/api-helpers';

type Review = {
  activeEmployeeCount: number;
  items: Array<{
    employeeId: string;
    employeeNumber: string;
    name: string;
    hasPayrollLine: boolean;
    gross: number;
    deductions: number;
    net: number;
    breakdown: {
      workingDays: number;
      paidLeaveDays: number;
      unpaidDays: number;
      unpaidLeaveDeduction: number;
      componentDeductionsTotal: number;
      componentDeductions: Array<{ code: string; name: string; amount: number }>;
      otherDeductions: number;
      advanceRecovery: number;
      statutory: Array<{ scheme: string; amount: number }>;
    };
  }>;
  totals: { gross: number; deductions: number; net: number };
};

/**
 * A calculated run's figures before approval: totals, then each person's gross, deductions and
 * net. Payslips only exist after release, so this is what an approver checks before signing off.
 * Loaded when opened, and again whenever the run is recalculated.
 */
export function PayrollRunReview({
  runId,
  calculatedAt,
  released = false,
  slips = [],
}: {
  runId: string;
  calculatedAt: string;
  released?: boolean;
  slips?: readonly Payslip[];
}) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const [open, setOpen] = useState(released);
  const review = useAsyncResource<Review>(
    async () =>
      (await apiRequest(orgPath(organizationId!, `/payroll/runs/${runId}/review`), {
        method: 'GET',
      })) as Review,
    [organizationId, runId, calculatedAt],
    { enabled: (released || open) && Boolean(organizationId) },
  );
  const data = review.data;
  const paidCount = data ? data.items.filter((item) => item.net > 0 || item.gross > 0).length : 0;
  const lineCount = data ? data.items.filter((item) => item.hasPayrollLine).length : 0;
  const noLineCount = data ? Math.max(0, data.activeEmployeeCount - lineCount) : 0;
  const tiles = data
    ? [
        { label: 'Employees paid', value: `${paidCount} of ${data.activeEmployeeCount} active` },
        { label: 'Gross', value: formatMoney(data.totals.gross) },
        { label: 'Deductions', value: formatMoney(data.totals.deductions) },
        { label: 'Net', value: formatMoney(data.totals.net) },
      ]
    : [];

  return (
    <div className="border-t border-border">
      {!released && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Check the figures before approving; payslips are issued when the run is released.
          </p>
          <Button
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {open ? 'Hide figures' : 'Review figures'}
          </Button>
        </div>
      )}
      {released && data && (
        <dl className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
          {tiles.map((tile) => (
            <div className="bg-card px-4 py-2.5" key={tile.label}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {tile.label}
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold text-foreground">{tile.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {open && review.loading && (
        <p className="px-4 pb-3 text-xs text-muted-foreground" role="status">
          {released ? 'Loading all current employees in this run…' : 'Loading the run’s figures…'}
        </p>
      )}
      {open && review.error && (
        <p className="px-4 pb-3 text-xs text-destructive" role="alert">
          {review.error}
        </p>
      )}
      {open && data && (
        <>
          {!released && (
            <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
              {tiles.map((tile) => (
                <div className="bg-card px-4 py-3" key={tile.label}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tile.label}
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-bold text-foreground">{tile.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="border-t border-border bg-muted/20 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">{lineCount} of {data.activeEmployeeCount} current employees</span>{' '}
            have a payroll line for this period. {noLineCount > 0
              ? `${noLineCount} ${noLineCount === 1 ? 'employee has' : 'employees have'} no payroll line and are included below with zero amounts.`
              : 'Every current employee has a payroll line.'}
          </p>
          <div className="overflow-x-auto border-t border-border">
            <table className={`w-full ${released ? 'min-w-[820px]' : 'min-w-[680px]'} text-left text-sm`}>
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Employee</th>
                  <th className="px-5 py-3 text-right font-bold">Gross</th>
                  <th className="px-5 py-3 text-right font-bold">Deductions</th>
                  <th className="px-5 py-3 text-right font-bold">Net</th>
                  {released && <th className="px-3 py-3 text-right font-bold">Payslip</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => (
                  <tr className="transition-colors hover:bg-muted/20" key={item.employeeId}>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground">{item.employeeNumber}</span>
                        {!item.hasPayrollLine ? (
                          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            No payroll line
                          </span>
                        ) : item.net <= 0 ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            Nothing to pay
                          </span>
                        ) : null}
                      </div>
                      {item.hasPayrollLine ? (
                        <>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {item.breakdown.workingDays} scheduled work days ·{' '}
                            {Math.max(0, item.breakdown.workingDays - item.breakdown.unpaidDays)} payable days ·{' '}
                            {item.breakdown.unpaidDays} unpaid days · {item.breakdown.paidLeaveDays} paid
                            leave
                            {item.breakdown.unpaidLeaveDeduction > 0 && (
                              <>
                                {' '}
                                · unpaid-time adjustment{' '}
                                {formatMoney(item.breakdown.unpaidLeaveDeduction)}
                              </>
                            )}
                          </span>
                          {item.deductions > 0 && (
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              <span className="font-medium text-foreground">Deduction detail:</span>{' '}
                              {[
                                ...item.breakdown.statutory.map(
                                  (entry) => `${entry.scheme} ${formatMoney(entry.amount)}`,
                                ),
                                ...item.breakdown.componentDeductions.map(
                                  (entry) => `${entry.name} ${formatMoney(entry.amount)}`,
                                ),
                                item.breakdown.otherDeductions > 0 &&
                                  `Other ${formatMoney(item.breakdown.otherDeductions)}`,
                                item.breakdown.advanceRecovery > 0 &&
                                  `Advance recovery ${formatMoney(item.breakdown.advanceRecovery)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Review configured deductions'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          No payroll line was generated for this period. Check payroll eligibility,
                          joining date, and effective salary or pay components.
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top font-mono text-sm tabular-nums">
                      {formatMoney(item.gross)}
                    </td>
                    <td className="px-5 py-3 text-right align-top font-mono text-sm tabular-nums">
                      {formatMoney(item.deductions)}
                    </td>
                    <td className="px-5 py-3 text-right align-top font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(item.net)}
                    </td>
                    {released && (
                      <td className="px-3 py-3 text-right align-top">
                        {slips.find((slip) => slip.employeeId === item.employeeId) && (
                          <Button
                            onClick={() => {
                              const slip = slips.find((entry) => entry.employeeId === item.employeeId);
                              if (slip) void downloadPayslipPdf(slip);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Payslip PDF
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
