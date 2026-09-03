'use client';

import React, { useMemo, useState } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button, Input } from '@smarteam/ui';
import { useCompensation } from '../../hooks/use-compensation';
import { useEmployees } from '../../hooks/use-workforce';
import { ComponentCatalogPanel } from './component-catalog-panel';
import { EmployeeCompensationPanel } from './employee-compensation-panel';

type Tab = 'employees' | 'catalog';

/**
 * Compensation configuration.
 *
 * Replaces a 2,240-line builder backed by `payroll-structures.json`, `salary-components.json` and
 * `localStorage`. That builder modelled named "salary structures" targeted at roles and
 * departments, each carrying its own EPF/ESI/PT/TDS/gratuity switches and a CTC simulator. **No
 * such entity exists in this backend**, and none of it reached a payroll calculation.
 *
 * What the backend actually models — and therefore all this screen offers — is a pay-component
 * catalogue, an effective-dated gross salary per employee, and effective-dated component
 * assignments. Everything else the old builder displayed is recorded as unavailable in
 * `docs/backend-gaps.md` rather than reproduced.
 */
export function ScreenCompensation() {
  const compensation = useCompensation();
  const employees = useEmployees();
  const [tab, setTab] = useScreenTab<Tab>('compensationTab', ['employees', 'catalog'], 'employees');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (employees.data ?? []).filter(
        (employee) =>
          !query ||
          `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(query) ||
          employee.employeeNumber.toLowerCase().includes(query),
      ),
    [employees.data, query],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {(
          [
            { id: 'employees', label: 'Employee compensation' },
            { id: 'catalog', label: 'Component catalogue' },
          ] as Array<{ id: Tab; label: string }>
        ).map((entry) => (
          <Button
            className={`rounded-none pb-1 text-xs font-semibold ${
              tab === entry.id
                ? 'border-b-2 border-foreground font-bold text-foreground'
                : 'text-muted-foreground'
            }`}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {tab === 'catalog' && <ComponentCatalogPanel compensation={compensation} />}

      {tab === 'employees' && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            <Input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee"
              value={search}
            />
            {employees.loading && (
              <p className="px-1 py-3 text-xs text-muted-foreground" role="status">
                Loading employees...
              </p>
            )}
            {!employees.loading && !employees.canRead && (
              <p className="px-1 py-3 text-xs text-muted-foreground" role="status">
                You do not have permission to list employees.
              </p>
            )}
            {!employees.loading && employees.canRead && rows.length === 0 && (
              <p className="px-1 py-3 text-xs text-muted-foreground">No employees match.</p>
            )}
            <ul className="max-h-[520px] space-y-1 overflow-y-auto">
              {rows.map((employee) => (
                <li key={employee.id}>
                  <button
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      compensation.employeeId === employee.id
                        ? 'border-foreground bg-muted/60 font-semibold text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                    }`}
                    onClick={() => compensation.selectEmployee(employee.id)}
                    type="button"
                  >
                    <span className="block text-foreground">
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span className="font-mono text-[10px]">{employee.employeeNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <EmployeeCompensationPanel compensation={compensation} />
        </div>
      )}
    </div>
  );
}
