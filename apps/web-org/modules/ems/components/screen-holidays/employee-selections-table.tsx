'use client';

import React from 'react';
import { Badge } from '@smarteam/ui';
import type { EmployeeHolidaySelection } from '@smarteam/contracts';

interface EmployeeSelectionsTableProps {
  selections: EmployeeHolidaySelection[];
  loading?: boolean;
}

export function EmployeeSelectionsTable({
  selections,
  loading = false,
}: EmployeeSelectionsTableProps) {
  if (loading) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground" role="status">
        Loading employee selections...
      </p>
    );
  }

  if (selections.length === 0) {
    return (
      <div className="flex min-h-[clamp(180px,35vh,320px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-semibold text-foreground">No selections recorded</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When employees select optional holidays from the pool, their selections will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Employee</th>
            <th className="px-4 py-2.5 font-bold">Holiday</th>
            <th className="px-4 py-2.5 font-bold">Holiday Date</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
            <th className="px-4 py-2.5 font-bold">Selected On</th>
          </tr>
        </thead>
        <tbody>
          {selections.map((sel) => {
            const empName = sel.employee
              ? `${sel.employee.firstName} ${sel.employee.lastName}`.trim()
              : sel.employeeId;
            const holName = sel.holiday?.name ?? 'Optional Holiday';
            const holDate = sel.holiday?.holidayDate ? sel.holiday.holidayDate.slice(0, 10) : '—';
            const selectedDate = sel.selectedAt ? sel.selectedAt.slice(0, 10) : '—';

            return (
              <tr
                className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                key={sel.id}
              >
                <td className="px-4 py-2.5 font-medium text-foreground">
                  <div className="flex flex-col">
                    <span>{empName}</span>
                    {sel.employee?.employeeNumber && (
                      <span className="text-[10px] text-muted-foreground">
                        {sel.employee.employeeNumber}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-semibold text-foreground">{holName}</td>
                <td className="px-4 py-2.5 font-mono text-foreground">{holDate}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={sel.status === 'CONFIRMED' ? 'success' : 'secondary'}>
                    {sel.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{selectedDate}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
