'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button, Input } from '@smarteam/ui';
import { Search, Users, SlidersHorizontal } from 'lucide-react';
import { useCompensation } from '../../hooks/use-compensation';
import { useEmployees } from '../../hooks/use-workforce';
import { ComponentCatalogPanel } from './component-catalog-panel';
import { EmployeeCompensationPanel } from './employee-compensation-panel';
import { RoleSalaryAllotmentDialog } from './role-salary-allotment-dialog';

type Tab = 'employees' | 'catalog';

/**
 * Enterprise Compensation Configuration Screen.
 *
 * Provides a responsive, single-view desktop layout with a compact employee directory
 * and an adaptive compensation workspace.
 */
export function ScreenCompensation() {
  const compensation = useCompensation();
  const employees = useEmployees();
  const [tab, setTab] = useScreenTab<Tab>('compensationTab', ['employees', 'catalog'], 'employees');
  const [search, setSearch] = useState('');
  const [allottingRole, setAllottingRole] = useState(false);

  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (employees.data ?? []).filter(
        (employee) =>
          !query ||
          `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(query) ||
          employee.employeeNumber.toLowerCase().includes(query) ||
          (employee.workEmail && employee.workEmail.toLowerCase().includes(query)),
      ),
    [employees.data, query],
  );

  // Auto-select first employee if none selected
  useEffect(() => {
    if (!compensation.employeeId && rows.length > 0 && rows[0]) {
      compensation.selectEmployee(rows[0].id);
    }
  }, [compensation, rows]);

  const selectedEmployee = useMemo(
    () => (employees.data ?? []).find((e) => e.id === compensation.employeeId) ?? null,
    [employees.data, compensation.employeeId],
  );

  return (
    <div className="w-full min-w-0 space-y-3.5">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-2">
        <div className="flex items-center gap-2 sm:gap-4">
          {(
            [
              { id: 'employees', label: 'Employee compensation' },
              { id: 'catalog', label: 'Component catalogue' },
            ] as Array<{ id: Tab; label: string }>
          ).map((entry) => (
            <Button
              className={`rounded-none pb-1.5 text-xs font-semibold transition-all ${
                tab === entry.id
                  ? 'border-b-2 border-primary font-bold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
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

        {tab === 'employees' && compensation.can.saveSalary && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs font-medium"
            onClick={() => setAllottingRole(true)}
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            Role-wise allotment
          </Button>
        )}
      </div>

      {tab === 'catalog' && <ComponentCatalogPanel compensation={compensation} />}

      {tab === 'employees' && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Left Employee Directory Sidebar */}
          <aside className="w-full shrink-0 space-y-2.5 lg:w-[240px] xl:w-[260px]">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Input
                  className="h-8 pl-8 text-xs"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, ID or email..."
                  value={search}
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Filter employees">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>

            <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Employees ({rows.length})</span>
            </div>

            {employees.loading && (
              <p className="px-1 py-3 text-xs text-muted-foreground" role="status">
                Loading employee directory...
              </p>
            )}
            {!employees.loading && !employees.canRead && (
              <p className="px-1 py-3 text-xs text-muted-foreground" role="status">
                You do not have permission to list employees.
              </p>
            )}
            {!employees.loading && employees.canRead && rows.length === 0 && (
              <p className="px-1 py-3 text-xs text-muted-foreground">No employees found.</p>
            )}

            <ul className="max-h-[calc(100vh-230px)] min-h-[160px] space-y-1.5 overflow-y-auto pr-1">
              {rows.map((employee) => {
                const isSelected = compensation.employeeId === employee.id;
                const initials =
                  `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
                return (
                  <li key={employee.id}>
                    <button
                      className={`w-full rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary/50 bg-primary/10 font-semibold text-foreground shadow-2xs ring-1 ring-primary/30'
                          : 'border-border/70 bg-card text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                      }`}
                      onClick={() => compensation.selectEmployee(employee.id)}
                      type="button"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold text-foreground text-xs">
                              {employee.firstName} {employee.lastName}
                            </span>
                            {employee.status && (
                              <span
                                className={`shrink-0 text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                                  employee.status === 'ACTIVE'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {employee.status === 'ACTIVE' ? 'Active' : employee.status}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                            <span>ID: {employee.employeeNumber}</span>
                          </div>
                          {employee.employmentType && (
                            <div className="truncate text-[10px] capitalize text-muted-foreground">
                              {employee.employmentType.toLowerCase().replace(/_/g, ' ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Main Workspace Area */}
          <main className="min-w-0 flex-1">
            <EmployeeCompensationPanel compensation={compensation} employee={selectedEmployee} />
          </main>
        </div>
      )}

      <RoleSalaryAllotmentDialog
        compensation={compensation}
        onOpenChange={setAllottingRole}
        open={allottingRole}
      />
    </div>
  );
}
