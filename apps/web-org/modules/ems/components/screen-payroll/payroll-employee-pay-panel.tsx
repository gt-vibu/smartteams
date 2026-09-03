'use client';

import React, { useState } from 'react';
import { Input } from '@smarteam/ui';
import { formatMoney } from '@smarteam/contracts';
import type { PayrollAdminState } from '../../hooks/use-payroll-admin';

/**
 * What each employee was actually paid, from released payslips.
 *
 * The table this replaced listed PAN, UAN and tax regime per employee, and a net take-home from a
 * fixture. None of those three identifiers exist on the employee model, and the take-home was not
 * a figure payroll had produced. Only the payslip totals the backend stored are shown here.
 */
export function PayrollEmployeePayPanel({ admin }: { admin: PayrollAdminState }) {
  const [search, setSearch] = useState('');

  if (admin.payslipsUnavailable) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reading every employee&apos;s pay needs the organisation-wide payslip permission.
        </p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const rows = admin.payslips.filter(
    (slip) => !query || (slip.employeeNumber ?? '').toLowerCase().includes(query),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          One row per released payslip. Tax identifiers and tax regime are not held by the backend.
        </p>
        <Input
          className="w-52"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search employee number"
          value={search}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm font-bold text-foreground">Nothing paid yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payslips appear once a payroll run has been released.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Employee</th>
                <th className="px-4 py-2.5 font-bold">Period</th>
                <th className="px-4 py-2.5 text-right font-bold">Gross</th>
                <th className="px-4 py-2.5 text-right font-bold">Deductions</th>
                <th className="px-4 py-2.5 text-right font-bold">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((slip) => (
                <tr
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  key={slip.id}
                >
                  <td className="px-4 py-2.5 font-semibold text-foreground">
                    {slip.employeeNumber ?? slip.employeeId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                    {slip.run.periodStart.slice(0, 10)} – {slip.run.periodEnd.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {formatMoney(slip.totals.grossAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {formatMoney(slip.totals.deductionAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">
                    {formatMoney(slip.totals.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
