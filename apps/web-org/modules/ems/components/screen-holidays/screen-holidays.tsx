'use client';

import React, { useState } from 'react';
import { CalendarDays, Settings2 } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Badge, Button, Input, SegmentedTabs } from '@smarteam/ui';
import type { Holiday } from '@smarteam/contracts';
import { useHolidays } from '../../hooks/use-holidays';
import { HolidayDialog, RetireHolidayDialog, AllowanceDialog } from './holiday-dialogs';
import { EmployeeSelectionsTable } from './employee-selections-table';
import { PageShell } from '../layout/page-shell';

/**
 * The holiday calendar and administration workspace.
 *
 * Supports mandatory holidays, optional/floating holiday pools, annual allowance configuration,
 * and viewing employee selections roster.
 */
export function ScreenHolidays() {
  const holidays = useHolidays();
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<Holiday | null>(null);
  const [configuringAllowance, setConfiguringAllowance] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'OPTIONAL' | 'SELECTIONS'>('ALL');

  if (holidays.forbidden) {
    return (
      <PageShell>
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="status"
        >
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view the holiday calendar.
          </p>
        </div>
      </PageShell>
    );
  }

  const active = holidays.holidays.filter((holiday) => holiday.isActive);
  const optionalCount = active.filter((h) => h.isOptional).length;
  const mandatoryCount = active.filter((h) => !h.isOptional).length;

  const tabs = [
    { id: 'ALL', label: 'All Holidays', count: holidays.holidays.length },
    { id: 'OPTIONAL', label: 'Optional Pool', count: optionalCount },
    { id: 'SELECTIONS', label: 'Employee Selections', count: holidays.selections.length },
  ];

  const displayedHolidays =
    activeTab === 'OPTIONAL' ? holidays.holidays.filter((h) => h.isOptional) : holidays.holidays;

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScreenHeader
          description={`${mandatoryCount} mandatory · ${optionalCount} optional pool in ${holidays.year}`}
          icon={CalendarDays}
          title="Holiday calendar"
          tone="success"
        />
        <div className="flex items-center gap-2">
          <Input
            aria-label="Year"
            className="w-24"
            inputMode="numeric"
            onChange={(event) => holidays.setYear(event.target.value)}
            type="number"
            value={holidays.year}
          />
          {holidays.canWrite && (
            <>
              <Button
                onClick={() => setConfiguringAllowance(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                Allowance ({holidays.settings.optionalHolidayAllowance}d
                {holidays.employeePolicies.length > 0
                  ? ` · ${holidays.employeePolicies.length} override${holidays.employeePolicies.length === 1 ? '' : 's'}`
                  : ''}
                )
              </Button>
              <Button onClick={() => setCreating(true)} size="sm" type="button">
                Add holiday
              </Button>
            </>
          )}
        </div>
      </div>

      {holidays.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {holidays.saveError}
        </p>
      )}

      {/* Tabs */}
      <div className="border-b border-border pb-1">
        <SegmentedTabs
          aria-label="Filter holiday view"
          items={tabs}
          onValueChange={(val) => setActiveTab(val as 'ALL' | 'OPTIONAL' | 'SELECTIONS')}
          value={activeTab}
        />
      </div>

      {holidays.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading holidays...
        </p>
      )}

      {!holidays.loading && holidays.error && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-sm font-bold text-foreground">Could not load holidays</p>
          <p className="mt-1 text-xs text-muted-foreground">{holidays.error}</p>
          <Button
            className="mt-3"
            onClick={() => void holidays.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!holidays.loading && !holidays.error && activeTab === 'SELECTIONS' && (
        <EmployeeSelectionsTable loading={holidays.loading} selections={holidays.selections} />
      )}

      {!holidays.loading && !holidays.error && activeTab !== 'SELECTIONS' && (
        <>
          {displayedHolidays.length === 0 ? (
            <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm font-bold text-foreground">
                {activeTab === 'OPTIONAL'
                  ? 'No optional holidays configured'
                  : `No holidays in ${holidays.year}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === 'OPTIONAL'
                  ? 'Add holidays with the "Optional holiday" flag to create a floating holiday pool.'
                  : 'Leave requests spanning this year are charged for every working day until a holiday is added.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-border bg-table-header">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Holiday</th>
                    <th className="px-4 py-2.5 font-bold">Type</th>
                    <th className="px-4 py-2.5 font-bold">Scope</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHolidays.map((holiday) => (
                    <tr
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                      key={holiday.id}
                    >
                      <td className="px-4 py-2.5 font-mono text-foreground">
                        {holiday.holidayDate.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">{holiday.name}</td>
                      <td className="px-4 py-2.5">
                        {holiday.isOptional ? (
                          <Badge variant="outline">Optional Pool</Badge>
                        ) : (
                          <Badge variant="secondary">Mandatory</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {holiday.branchId ? 'One branch' : 'Whole organization'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={holiday.isActive ? 'success' : 'secondary'}>
                          {holiday.isActive ? 'Active' : 'Retired'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {holidays.canWrite && holiday.isActive && (
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => setEditing(holiday)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Rename
                            </Button>
                            <Button
                              onClick={() => setRetiring(holiday)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Retire
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Mandatory holidays automatically apply to all employees. Optional/floating holidays are
            available in an eligible pool and apply only when selected by an employee up to the
            annual allowance ({holidays.settings.optionalHolidayAllowance} days). An active
            effective holiday is excluded from charged leave days.
          </p>
        </>
      )}

      <HolidayDialog
        holiday={editing}
        holidays={holidays}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
      />
      <RetireHolidayDialog
        holiday={retiring}
        holidays={holidays}
        onOpenChange={(open) => !open && setRetiring(null)}
        open={retiring !== null}
      />
      <AllowanceDialog
        holidays={holidays}
        onOpenChange={(open) => !open && setConfiguringAllowance(false)}
        open={configuringAllowance}
      />
    </PageShell>
  );
}
