'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import { formatMoney, type Payslip } from '@smarteam/contracts';
import { downloadPayslipPdf } from '../../lib/payslip-pdf';

/** Paid means something was actually owed: a payslip with nothing on it is not a payment. */
export const isPaid = (slip: Payslip) => slip.totals.netAmount > 0 || slip.totals.grossAmount > 0;

/**
 * Who a released run paid and how much, one row per payslip. Opening a row shows the lines that
 * make up that person's pay. Payslips with nothing on them — usually no salary set for the period
 * — are listed last and labelled, rather than counted as paid.
 */
export function PayrollRunBreakdown({ slips }: { slips: readonly Payslip[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ordered = [...slips].sort(
    (a, b) =>
      Number(isPaid(b)) - Number(isPaid(a)) ||
      (a.employeeName ?? a.employeeNumber ?? '').localeCompare(
        b.employeeName ?? b.employeeNumber ?? '',
      ),
  );

  if (ordered.length === 0) {
    return (
      <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        No payslips were issued in this run.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-bold">Employee</th>
            <th className="px-4 py-2 text-right font-bold">Gross</th>
            <th className="px-4 py-2 text-right font-bold">Deductions</th>
            <th className="px-4 py-2 text-right font-bold">Net</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((slip) => {
            const paid = isPaid(slip);
            const open = openId === slip.id;
            return (
              <React.Fragment key={slip.id}>
                <tr
                  aria-expanded={open}
                  className="cursor-pointer border-t border-border hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  onClick={() => setOpenId(open ? null : slip.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOpenId(open ? null : slip.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-4 py-2">
                    <span className="font-semibold text-foreground">
                      {slip.employeeName ?? slip.employeeNumber ?? 'Employee'}
                    </span>
                    {slip.employeeName && slip.employeeNumber && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {slip.employeeNumber}
                      </span>
                    )}
                    {!paid && (
                      <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Nothing to pay
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(slip.totals.grossAmount)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(slip.totals.deductionAmount)}
                  </td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums">
                    {formatMoney(slip.totals.netAmount)}
                  </td>
                </tr>
                {open && (
                  <tr className="bg-muted/20">
                    <td className="px-4 py-2" colSpan={4}>
                      {!paid ? (
                        <p className="text-[11px] text-muted-foreground">
                          Nothing was calculated for this period — usually because no salary is set
                          for this employee. Set one under Compensation and recalculate the next
                          run.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {slip.components.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              The line-by-line breakdown is not shown for this employee&apos;s
                              payslip.
                            </p>
                          ) : (
                            <ul className="grid gap-1 sm:grid-cols-2">
                              {slip.components.map((component) => (
                                <li
                                  className="flex justify-between gap-3 text-[11px]"
                                  key={component.componentCode}
                                >
                                  <span className="text-muted-foreground">
                                    {component.componentName}
                                    {component.componentType === 'DEDUCTION' ? ' (deduction)' : ''}
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatMoney(component.amount)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Button
                            onClick={() => void downloadPayslipPdf(slip)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Payslip PDF
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
