'use client';

import React from 'react';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';

/**
 * The employee's salary structure, exactly as the backend derives it.
 *
 * Every figure here comes from `GET /payroll/profile`, which applies the organisation's payroll
 * policy and its statutory rules. The screen this replaced computed its own: PF was hardcoded to
 * 1800, professional tax to 200, and income tax to ten percent of gross — none of which the
 * backend had agreed to, and none of which matched what a payroll run would actually pay.
 *
 * Income tax, gratuity and annual CTC are absent because the backend does not calculate them.
 * They are stated as unavailable rather than estimated.
 */

function Row({
  name,
  amount,
  note,
  tone = 'default',
}: {
  name: string;
  amount: number;
  note?: string;
  tone?: 'default' | 'deduction';
}) {
  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
      <td className="px-4 py-2.5">
        <span className="font-medium text-foreground">{name}</span>
        {note && <span className="mt-0.5 block text-[10px] text-muted-foreground">{note}</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-foreground">
        {tone === 'deduction' && amount > 0 ? '-' : ''}
        {formatMoney(amount)}
      </td>
    </tr>
  );
}

function Section({
  title,
  total,
  children,
}: {
  title: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/40">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">{title}</th>
            <th className="px-4 py-2.5 text-right font-bold">Monthly</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30">
            <td className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Total
            </td>
            <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">
              {formatMoney(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PayrollStructurePanel({ profile }: { profile: SalaryProfile }) {
  const { salaryBreakdown } = profile;
  const totalEarnings = salaryBreakdown.earnings.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {[
          { label: 'Monthly gross', value: salaryBreakdown.gross },
          { label: 'Deductions', value: salaryBreakdown.totalDeductions },
          { label: 'Net pay', value: salaryBreakdown.netPay },
        ].map((tile) => (
          <div className="bg-card px-4 py-3" key={tile.label}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </dt>
            <dd className="mt-1 font-mono text-sm font-bold text-foreground">
              {formatMoney(tile.value)}
            </dd>
          </div>
        ))}
      </dl>

      <Section title="Earnings" total={totalEarnings}>
        {salaryBreakdown.earnings.map((item) => (
          <Row amount={item.amount} key={item.code} name={item.name} />
        ))}
      </Section>

      <Section title="Deductions" total={salaryBreakdown.totalDeductions}>
        {salaryBreakdown.deductions.length === 0 && (
          <tr>
            <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
              No deductions apply to this structure.
            </td>
          </tr>
        )}
        {salaryBreakdown.deductions.map((item) => (
          <Row
            amount={item.amount}
            key={item.code}
            name={item.name}
            note={item.eligible === false ? item.reason : undefined}
            tone="deduction"
          />
        ))}
      </Section>

      {salaryBreakdown.employerBenefits.length > 0 && (
        <Section title="Employer contributions" total={salaryBreakdown.totalEmployerBenefits}>
          {salaryBreakdown.employerBenefits.map((item) => (
            <Row amount={item.amount} key={item.code} name={item.name} />
          ))}
        </Section>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Figures are calculated by payroll from your organisation&apos;s policy and statutory rules.
        Income tax, gratuity and annual cost to company are not calculated by the system and are
        therefore not shown.
      </p>
    </div>
  );
}
