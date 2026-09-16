'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/use-media-query';
import { Button, Input } from '@smarteam/ui';
import { ChevronLeft, Search, Users } from 'lucide-react';
import { useCompensation } from '../../hooks/use-compensation';
import { useEmployees } from '../../hooks/use-workforce';
import { ComponentCatalogPanel } from './component-catalog-panel';
import { EmployeeCompensationPanel } from './employee-compensation-panel';
import { RoleSalaryAllotmentDialog } from './role-salary-allotment-dialog';

type Tab = 'employees' | 'catalog';

/**
 * Enterprise Compensation Configuration Screen.
 *
 * On a laptop: the employee directory beside the selected employee's compensation. On a phone
 * those two stacked into one page — the directory in a box that scrolled on its own, then the
 * first employee's full pay panel under it, chosen for you. It is list, then detail, as a phone
 * app would do it: the directory fills the screen, a tap opens one employee, and Back (the
 * link, or the device's own) returns to the list because the view is in the URL.
 */
export function ScreenCompensation() {
  const compensation = useCompensation();
  const employees = useEmployees();
  const [tab, setTab] = useScreenTab<Tab>('compensationTab', ['employees', 'catalog'], 'employees');
  const [search, setSearch] = useState('');
  const [allottingRole, setAllottingRole] = useState(false);
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [view, setView] = useScreenTab<'list' | 'detail'>(
    'compensationView',
    ['list', 'detail'],
    'list',
  );
  const showList = isWide || view === 'list';
  const showDetail = isWide || view === 'detail';

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

  // On a laptop the detail pane is always on screen, so it opens on the first employee rather
  // than empty. On a phone nobody is chosen until someone is tapped.
  useEffect(() => {
    if (isWide && !compensation.employeeId && rows.length > 0 && rows[0]) {
      compensation.selectEmployee(rows[0].id);
    }
  }, [compensation, rows, isWide]);

  const openEmployee = (employeeId: string) => {
    compensation.selectEmployee(employeeId);
    if (!isWide) setView('detail');
  };

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
          {showList && (
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

              {/* Its own scroller only beside the detail pane; on a phone the page scrolls, once. */}
              <ul className="space-y-1.5 lg:max-h-[calc(100dvh-230px)] lg:min-h-[160px] lg:overflow-y-auto lg:pr-1">
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
                        onClick={() => openEmployee(employee.id)}
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
          )}

          {/* A section, not a second <main>: the workspace canvas is already the page's main. */}
          {showDetail && (
            <section aria-label="Compensation" className="min-w-0 flex-1 space-y-3">
              {!isWide && (
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="-ml-1 flex min-h-10 items-center gap-1 rounded-md px-1 text-sm font-semibold text-primary cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  All employees
                </button>
              )}
              <EmployeeCompensationPanel compensation={compensation} employee={selectedEmployee} />
            </section>
          )}
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
