'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';
import { Plus } from 'lucide-react';

type Row = { code: string; name: string; amount: number };

function Section({ title, rows, sign = '' }: { title: string; rows: Row[]; sign?: string }) {
  if (rows.length === 0) return null;
  return (
    <>
      <tr>
        <th
          className="bg-muted/30 px-4 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          colSpan={3}
          scope="colgroup"
        >
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={`${title}-${row.code}`}>
          <td className="px-4 py-2 text-foreground">{row.name}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {sign}
            {formatMoney(row.amount)}
          </td>
          <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
            {sign}
            {formatMoney(row.amount * 12)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Total({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'bg-primary/5 font-bold' : 'font-semibold'}>
      <td className="px-4 py-2 text-foreground">{label}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMoney(amount)}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(amount * 12)}</td>
    </tr>
  );
}

/**
 * The whole salary as one statement, the way a payslip reads: earnings, gross, deductions, take
 * home, then what the employer adds on top to make the CTC. It replaces three cards and a chart
 * that showed the same numbers in different shapes.
 */
export function SalaryBreakdownCard({
  profile,
  canAssign,
  onAssignComponent,
}: {
  profile: SalaryProfile;
  canAssign: boolean;
  onAssignComponent: () => void;
}) {
  const { salaryBreakdown: b, employeePolicy } = profile;
  const deductions = b.deductions.filter((row) => row.amount > 0);
  const employer = b.employerBenefits.filter((row) => row.amount > 0);
  const jurisdiction =
    employeePolicy?.statutoryJurisdiction ?? profile.organizationPolicy?.statutoryJurisdiction;
  const ctc = b.gross + b.totalEmployerBenefits;

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Salary breakdown</h3>
          <p className="text-xs text-muted-foreground">
            Annual CTC{' '}
            <span className="font-semibold text-foreground">{formatMoney(ctc * 12)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAssign && (
            <Button
              className="h-9 gap-1.5 text-xs"
              onClick={onAssignComponent}
              type="button"
              variant="outline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add component
            </Button>
          )}
        </div>
      </div>

      {profile.configurationWarnings?.map((warning) => (
        <p
          className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          key={warning}
          role="status"
        >
          {warning}
        </p>
      ))}

      {!jurisdiction && (
        <p
          className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          role="status"
        >
          PF and ESI use the national rates. Professional Tax is not calculated until the
          company&apos;s state is set under &ldquo;Basic, HRA &amp; state&rdquo;, because its slabs
          differ by state.
        </p>
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-bold" scope="col">
                Component
              </th>
              <th className="px-3 py-2 text-right font-bold" scope="col">
                Monthly
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Annual
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <Section rows={b.earnings} title="Earnings" />
            <Total amount={b.gross} label="Gross salary" />
            <Section rows={deductions} sign="−" title="Deductions" />
            <Total amount={b.netPay} label="Take-home pay" strong />
            <Section rows={employer} title="Employer contributions" />
            <Total amount={ctc} label="Cost to company (CTC)" />
          </tbody>
        </table>
      </div>
      <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        Statutory deductions use the rules and wage bases configured for this employee&apos;s
        jurisdiction. Check scheme eligibility and current rates with the applicable authority.
        Professional Tax follows the saved state schedule. Income tax (TDS) is not calculated here.
      </p>
    </div>
  );
}
