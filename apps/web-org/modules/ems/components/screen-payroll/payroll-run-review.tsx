'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

type Review = {
  items: Array<{
    employeeId: string;
    employeeNumber: string;
    name: string;
    gross: number;
    deductions: number;
    net: number;
  }>;
  totals: { gross: number; deductions: number; net: number };
};

/**
 * A calculated run's figures before approval: totals, then each person's gross, deductions and
 * net. Payslips only exist after release, so this is what an approver checks before signing off.
 * Loaded when opened, and again whenever the run is recalculated.
 */
export function PayrollRunReview({ runId, calculatedAt }: { runId: string; calculatedAt: string }) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const [open, setOpen] = useState(false);
  const review = useAsyncResource<Review>(
    async () =>
      (await apiRequest(orgPath(organizationId!, `/payroll/runs/${runId}/review`), {
        method: 'GET',
      })) as Review,
    [organizationId, runId, calculatedAt],
    { enabled: open && Boolean(organizationId) },
  );
  const data = review.data;
  const unpaid = data ? data.items.filter((item) => item.gross <= 0 && item.net <= 0).length : 0;

  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
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
      {open && review.loading && (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground" role="status">
          Loading the run’s figures…
        </p>
      )}
      {open && review.error && (
        <p className="px-4 pb-3 text-[11px] text-destructive" role="alert">
          {review.error}
        </p>
      )}
      {open && data && (
        <>
          <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            {[
              {
                label: 'Employees paid',
                value: `${data.items.length - unpaid} of ${data.items.length}`,
              },
              { label: 'Gross', value: formatMoney(data.totals.gross) },
              { label: 'Deductions', value: formatMoney(data.totals.deductions) },
              { label: 'Net', value: formatMoney(data.totals.net) },
            ].map((tile) => (
              <div className="bg-card px-4 py-2.5" key={tile.label}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </dt>
                <dd className="mt-0.5 tabular-nums text-xs font-bold text-foreground">
                  {tile.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-bold">Employee</th>
                  <th className="px-4 py-2 text-right font-bold">Gross</th>
                  <th className="px-4 py-2 text-right font-bold">Deductions</th>
                  <th className="px-4 py-2 text-right font-bold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => (
                  <tr key={item.employeeId}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-foreground">{item.name}</span>{' '}
                      <span className="text-muted-foreground">{item.employeeNumber}</span>
                      {item.gross <= 0 && item.net <= 0 && (
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          nothing to pay
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(item.gross)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(item.deductions)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(item.net)}
                    </td>
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
