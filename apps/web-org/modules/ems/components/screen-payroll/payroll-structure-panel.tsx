'use client';

import React from 'react';
import { formatMoney, type Employee, type SalaryProfile } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { FileSpreadsheet, Printer } from 'lucide-react';
import {
  downloadSalaryStructureCsv,
  openSalaryStructurePrintView,
} from './salary-structure-export';

/**
 * The employee's salary structure, exactly as the backend derives it.
 *
 * Every figure here comes from `GET /payroll/profile`, which applies the organisation's payroll
 * policy and its statutory rules.
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
        <thead className="border-b border-border bg-table-header">
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

export function PayrollStructurePanel({
  profile,
  employee,
  orgName,
}: {
  profile: SalaryProfile;
  employee?: Employee | null;
  orgName?: string;
}) {
  const { salaryBreakdown } = profile;
  const totalEarnings = salaryBreakdown.earnings.reduce((sum, item) => sum + item.amount, 0);

  const handlePrint = () => {
    openSalaryStructurePrintView({ profile, employee, orgName });
  };

  const handleCsv = () => {
    downloadSalaryStructureCsv({ profile, employee, orgName });
  };

  return (
    <div className="space-y-4">
      {/* Header bar with download options */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Your configured compensation structure and statutory allowances.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs font-medium gap-1.5 border-primary/30 text-primary hover:bg-primary/5 shadow-2xs"
            onClick={handlePrint}
            title="Download official Salary Annexure as PDF / Printable format"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Download Annexure (PDF)</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleCsv}
            title="Export Salary Structure to CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

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
