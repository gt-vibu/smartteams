'use client';

import React from 'react';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';

interface StatutoryApplicabilityCardProps {
  profile: SalaryProfile;
}

export function StatutoryApplicabilityCard({ profile }: StatutoryApplicabilityCardProps) {
  const { salaryBreakdown, structure } = profile;
  const deductions = salaryBreakdown.deductions;
  const gross = salaryBreakdown.gross;

  return (
    <div className="w-full min-w-0 rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/70 bg-muted/20 px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Deductions (Employee)
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Employee contributions and statutory deductions.
        </p>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3.5 py-2 font-bold">Component</th>
              <th className="px-2.5 py-2 font-bold">Type</th>
              <th className="px-2.5 py-2 font-bold">Value</th>
              <th className="px-2.5 py-2 text-right font-bold">Monthly (₹)</th>
              <th className="px-2.5 py-2 text-right font-bold">Annual (₹)</th>
              <th className="px-3 py-2 text-center font-bold">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-[11px]">
            {deductions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground">
                  No statutory deductions currently apply to this employee.
                </td>
              </tr>
            ) : (
              deductions.map((item) => {
                const annualAmount = item.amount * 12;
                const isApplicable = item.eligible !== false && item.amount > 0;

                let typeLabel = 'Statutory';
                let valueLabel = '—';

                if (['PF', 'EPF'].includes(item.code.toUpperCase())) {
                  const base = structure.base;
                  const pct = base > 0 ? Math.round((item.amount / base) * 100) : 12;
                  typeLabel = '% of Basic';
                  valueLabel = `${pct}%`;
                } else if (
                  item.code.toUpperCase() === 'ESIC' ||
                  item.code.toUpperCase() === 'ESI'
                ) {
                  const pct = gross > 0 ? ((item.amount / gross) * 100).toFixed(2) : '0.75';
                  typeLabel = '% of Gross';
                  valueLabel = `${pct}%`;
                } else if (['PT', 'PROFESSIONAL_TAX'].includes(item.code.toUpperCase())) {
                  typeLabel = 'As per slab';
                  valueLabel = formatMoney(item.amount);
                }

                return (
                  <tr key={item.code} className="transition-colors hover:bg-muted/20">
                    <td className="px-3.5 py-2">
                      <span className="font-semibold text-foreground">{item.name}</span>
                    </td>
                    <td className="px-2.5 py-2 text-muted-foreground">{typeLabel}</td>
                    <td className="px-2.5 py-2 font-mono text-muted-foreground">{valueLabel}</td>
                    <td className="px-2.5 py-2 text-right font-mono font-semibold text-foreground">
                      {formatMoney(item.amount)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-muted-foreground">
                      {formatMoney(annualAmount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          isApplicable ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                        }`}
                        title={isApplicable ? 'Covered' : 'Exempt / Zero'}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
