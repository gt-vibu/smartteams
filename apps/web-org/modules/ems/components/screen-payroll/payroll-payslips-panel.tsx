'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@smarteam/ui';
import { formatMoney, type Payslip } from '@smarteam/contracts';

/**
 * Payslips as the backend stored them.
 *
 * Totals and components are read from the released payroll run's line item. Nothing is derived:
 * the screen this replaced split gross into a synthetic basic and HRA whenever the fixture did
 * not carry them, and added an income-tax row the backend never calculated.
 *
 * A payslip whose `components` array is empty is one the organisation's salary-slip mode hides.
 * That is stated as withheld rather than rendered as an empty breakdown.
 */

const periodLabel = (payslip: Payslip) =>
  `${payslip.run.periodStart.slice(0, 10)} to ${payslip.run.periodEnd.slice(0, 10)}`;

function Breakdown({ payslip }: { payslip: Payslip }) {
  if (payslip.components.length === 0) {
    return (
      <p className="px-4 py-3 text-[11px] text-muted-foreground">
        The detailed breakdown is not disclosed for this payslip.
      </p>
    );
  }
  const earnings = payslip.components.filter((item) => item.componentType === 'EARNING');
  const deductions = payslip.components.filter((item) => item.componentType === 'DEDUCTION');
  return (
    <div className="grid gap-px bg-border sm:grid-cols-2">
      {[
        { title: 'Earnings', rows: earnings },
        { title: 'Deductions', rows: deductions },
      ].map((group) => (
        <div className="bg-card px-4 py-3" key={group.title}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </p>
          {group.rows.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">None</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {group.rows.map((row) => (
                <li className="flex justify-between gap-3 text-xs" key={row.componentCode}>
                  <span className="text-foreground">{row.componentName}</span>
                  <span className="font-mono text-muted-foreground">{formatMoney(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function PayrollPayslipsPanel({ payslips }: { payslips: Payslip[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (payslips.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <p className="text-sm font-bold text-foreground">No payslips yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A payslip appears here once a payroll run covering you has been released.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {payslips.map((payslip) => {
        const expanded = expandedId === payslip.id;
        return (
          <div className="rounded-lg border border-border bg-card" key={payslip.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-xs font-bold text-foreground">{periodLabel(payslip)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {payslip.run.status} · issued {payslip.issuedAt?.slice(0, 10) ?? '--'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</p>
                  <p className="font-mono text-sm font-bold text-foreground">
                    {formatMoney(payslip.totals.netAmount, payslip.run.currencyCode ?? 'INR')}
                  </p>
                </div>
                <Badge variant={payslip.status === 'PENDING_UPLOAD' ? 'secondary' : 'sky'}>
                  {payslip.status.replace(/_/g, ' ').toLowerCase()}
                </Badge>
                <Button
                  onClick={() => setExpandedId(expanded ? null : payslip.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {expanded ? 'Hide' : 'Breakdown'}
                </Button>
              </div>
            </div>
            {expanded && (
              <div className="border-t border-border">
                <div className="flex flex-wrap gap-6 px-4 py-3 text-xs">
                  <span className="text-muted-foreground">
                    Gross{' '}
                    <span className="font-mono text-foreground">
                      {formatMoney(payslip.totals.grossAmount)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Deductions{' '}
                    <span className="font-mono text-foreground">
                      {formatMoney(payslip.totals.deductionAmount)}
                    </span>
                  </span>
                </div>
                <Breakdown payslip={payslip} />
                <p className="px-4 py-2.5 text-[10px] text-muted-foreground">
                  Payable and loss-of-pay days are not published on a payslip by the API.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
