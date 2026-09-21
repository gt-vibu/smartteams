'use client';

import React, { useMemo } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { payrollRepository } from '../../repositories/payroll.repository';

const money = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' });

function tenure(from: string | null, to: string | null): string {
  if (!from || !to) return 'Not recorded';
  const start = new Date(from);
  const end = new Date(to);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 1) return 'Under a month';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} yr`, rest && `${rest} mo`].filter(Boolean).join(' ');
}

/**
 * What the company's relationship with someone who has left came to: when they joined and left,
 * how long that was, and what payroll paid them, summed from their payslips.
 */
export function FormerEmployeeSummary({
  employeeId,
  joined,
  left,
}: {
  employeeId: string;
  joined: string | null;
  left: string | null;
}) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const canReadPay = hasPermission(persona?.permissions ?? [], 'payroll.payslips.read.all');
  const payslips = useAsyncResource(
    () => payrollRepository.listPayslips(organizationId!, employeeId),
    [organizationId, employeeId],
    { enabled: Boolean(organizationId) && canReadPay },
  );
  const totals = useMemo(() => {
    const rows = payslips.data ?? [];
    const sorted = [...rows].sort((a, b) => b.run.periodEnd.localeCompare(a.run.periodEnd));
    return {
      count: rows.length,
      gross: rows.reduce((sum, slip) => sum + Number(slip.totals.grossAmount), 0),
      deductions: rows.reduce((sum, slip) => sum + Number(slip.totals.deductionAmount), 0),
      net: rows.reduce((sum, slip) => sum + Number(slip.totals.netAmount), 0),
      last: sorted[0] ?? null,
    };
  }, [payslips.data]);

  const facts: Array<[string, string]> = [
    ['Joined', joined?.slice(0, 10) ?? 'Not recorded'],
    ['Left', left?.slice(0, 10) ?? 'Not recorded'],
    ['Time with the company', tenure(joined, left)],
  ];
  if (canReadPay && !payslips.loading && !payslips.error)
    facts.push(
      ['Payslips issued', String(totals.count)],
      ['Total gross paid', money(totals.gross)],
      ['Total deductions', money(totals.deductions)],
      ['Total net paid', money(totals.net)],
      [
        'Last payslip',
        totals.last
          ? `${totals.last.run.periodStart.slice(0, 10)} to ${totals.last.run.periodEnd.slice(0, 10)}`
          : 'None',
      ],
    );

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-xs">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Time with the company
      </h3>
      {facts.map(([label, value]) => (
        <div className="flex justify-between gap-3" key={label}>
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums text-foreground">{value}</span>
        </div>
      ))}
      {canReadPay && payslips.loading && (
        <p className="text-muted-foreground" role="status">
          Adding up payslips…
        </p>
      )}
      {canReadPay && payslips.error && (
        <p className="text-destructive" role="alert">
          {payslips.error}
        </p>
      )}
      <p className="pt-1 text-[11px] text-muted-foreground">
        They can no longer sign in. Their records are kept as history and cannot be changed.
      </p>
    </section>
  );
}
