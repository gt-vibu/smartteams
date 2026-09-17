import React from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';
import { Plus, Sliders } from 'lucide-react';

interface EarningsBreakdownCardProps {
  profile: SalaryProfile;
  canAssign: boolean;
  canConfigurePolicy?: boolean;
  onAssignComponent: () => void;
  onConfigurePolicy?: () => void;
}

export function EarningsBreakdownCard({
  profile,
  canAssign,
  canConfigurePolicy = true,
  onAssignComponent,
  onConfigurePolicy,
}: EarningsBreakdownCardProps) {
  const { salaryBreakdown, structure, components = [] } = profile;
  const earnings = salaryBreakdown.earnings;
  const gross = salaryBreakdown.gross;

  return (
    <div className="w-full min-w-0 rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-4 py-2.5">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Earnings Components
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Basic, HRA, allowances and assigned earnings components.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canConfigurePolicy && onConfigurePolicy && (
            <Button
              onClick={onConfigurePolicy}
              size="sm"
              type="button"
              variant="outline"
              className="h-7 gap-1 text-[11px] font-medium"
              title="Configure Base % and HRA % in organization policy"
            >
              <Sliders className="h-3 w-3 text-primary" />
              Configure Policy
            </Button>
          )}

          {canAssign && (
            <Button
              onClick={onAssignComponent}
              size="sm"
              type="button"
              variant="outline"
              className="h-7 gap-1 text-[11px] font-medium"
            >
              <Plus className="h-3 w-3 text-primary" />
              Assign Component
            </Button>
          )}
        </div>
      </div>

      {/* Responsive Table */}
      <div className="w-full overflow-x-auto">
        <table className="stack-table w-full text-left text-xs">
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
            {earnings.map((item) => {
              const annualAmount = item.amount * 12;
              const percentOfGross = gross > 0 ? Math.round((item.amount / gross) * 100) : 0;

              let typeLabel = 'Policy';
              let valueLabel = '—';

              if (item.code.toUpperCase() === 'BASE' || item.code.toUpperCase() === 'BASIC') {
                typeLabel = '% of Gross';
                valueLabel = `${percentOfGross}%`;
              } else if (item.code.toUpperCase() === 'HRA') {
                const baseAmount = structure.base;
                const percentOfBase =
                  baseAmount > 0 ? Math.round((item.amount / baseAmount) * 100) : 0;
                typeLabel = '% of Basic';
                valueLabel = `${percentOfBase}%`;
              } else if (item.code.toUpperCase() === 'OTHER_ALLOWANCE') {
                typeLabel = 'Balancing';
                valueLabel = '—';
              } else {
                const assigned = components.find(
                  (c) => c.payComponent?.code === item.code || c.payComponentId === item.code,
                );
                if (assigned?.percentage !== null && assigned?.percentage !== undefined) {
                  typeLabel = '% of Basic';
                  valueLabel = `${assigned.percentage}%`;
                } else if (assigned?.amount !== null && assigned?.amount !== undefined) {
                  typeLabel = 'Fixed';
                  valueLabel = formatMoney(assigned.amount);
                } else {
                  typeLabel = 'Custom';
                }
              }

              const isBase =
                item.code.toUpperCase() === 'BASE' || item.code.toUpperCase() === 'BASIC';
              const isHra = item.code.toUpperCase() === 'HRA';
              const isConfigurable = (isBase || isHra) && canConfigurePolicy && onConfigurePolicy;

              return (
                <tr key={item.code} className="transition-colors hover:bg-muted/20">
                  <td data-cell="primary" className="px-3.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      {isConfigurable && (
                        <button
                          type="button"
                          onClick={onConfigurePolicy}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors cursor-pointer"
                          title="Configure percentage in organization policy"
                        >
                          <Sliders className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td data-label="Type" className="px-2.5 py-2 text-muted-foreground">
                    {typeLabel}
                  </td>
                  <td data-label="Value" className="px-2.5 py-2 font-mono text-muted-foreground">
                    {isConfigurable ? (
                      <button
                        type="button"
                        onClick={onConfigurePolicy}
                        className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                        title="Click to edit percentage in salary policy"
                      >
                        {valueLabel}
                        <Sliders className="h-2.5 w-2.5 opacity-70" />
                      </button>
                    ) : (
                      valueLabel
                    )}
                  </td>
                  <td
                    data-label="Monthly (₹)"
                    className="px-2.5 py-2 text-right font-mono font-semibold text-foreground"
                  >
                    {formatMoney(item.amount)}
                  </td>
                  <td
                    data-label="Annual (₹)"
                    className="px-2.5 py-2 text-right font-mono text-muted-foreground"
                  >
                    {formatMoney(annualAmount)}
                  </td>
                  <td data-label="Active" className="px-3 py-2 text-center">
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                      title="Active"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
