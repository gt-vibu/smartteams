'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import { formatDate, formatDateRange, formatMoney, type Payslip } from '@smarteam/contracts';
import { downloadPayslipPdf } from '../../lib/payslip-pdf';
import { downloadAnnualStatementPdf, type AnnualStatement } from '../../lib/annual-statement-pdf';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

/** The financial year (April to March) a date falls in, by its starting year. */
const financialYearOf = (date: Date) =>
  date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;

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
  formatDateRange(payslip.run.periodStart, payslip.run.periodEnd);

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
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { session } = useSession();

  if (payslips.length === 0) {
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-bold text-foreground">No payslips yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A payslip appears here once a payroll run covering you has been released.
        </p>
      </div>
    );
  }

  /** Runs one download at a time, and says so when the file could not be made. */
  const download = async (key: string, failure: string, make: () => Promise<void>) => {
    setBusy(key);
    setFailed(null);
    try {
      await make();
    } catch {
      setFailed(failure);
    } finally {
      setBusy(null);
    }
  };

  const annual = (year: number) => {
    const first = payslips[0];
    if (!first || !session) return;
    void download(
      `fy-${year}`,
      'The annual statement could not be downloaded. Try again.',
      async () => {
        const statement = (await apiRequest(
          orgPath(
            session.organizationId,
            `/payroll/employees/${encodeURIComponent(first.employeeId)}/annual-statement?year=${year}`,
          ),
          { method: 'GET' },
        )) as AnnualStatement;
        await downloadAnnualStatementPdf(statement, first.organizationName ?? '');
      },
    );
  };
  const thisYear = financialYearOf(new Date());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[11px] text-muted-foreground">Annual statement (Form 16 Part B)</span>
        {[thisYear, thisYear - 1].map((year) => (
          <Button
            disabled={busy !== null}
            key={year}
            onClick={() => annual(year)}
            size="sm"
            type="button"
            variant="outline"
          >
            FY {year}-{String((year + 1) % 100).padStart(2, '0')}
          </Button>
        ))}
      </div>
      {failed && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" role="alert">
          {failed}
        </p>
      )}
      {payslips.map((payslip) => {
        const expanded = expandedId === payslip.id;
        return (
          <div className="rounded-lg border border-border bg-card" key={payslip.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-xs font-bold text-foreground">{periodLabel(payslip)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {payslip.issuedAt ? `Issued ${formatDate(payslip.issuedAt)}` : 'Not issued yet'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</p>
                  <p className="font-mono text-sm font-bold text-foreground">
                    {formatMoney(payslip.totals.netAmount, payslip.run.currencyCode ?? 'INR')}
                  </p>
                </div>
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    void download(
                      payslip.id,
                      'The payslip could not be downloaded. Try again.',
                      () => downloadPayslipPdf(payslip),
                    )
                  }
                  size="sm"
                  type="button"
                >
                  {busy === payslip.id ? 'Preparing…' : 'Download PDF'}
                </Button>
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
