'use client';

import React, { useMemo, useState } from 'react';
import { formatDate, formatDateRange } from '@smarteam/contracts';
import { CalendarDays, Settings2, Users } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Badge, Button, Input, SegmentedTabs } from '@smarteam/ui';
import { useHolidays } from '../../hooks/use-holidays';
import {
  HolidayDialog,
  RetireHolidayDialog,
  AllowanceDialog,
  HolidaySelectionsDialog,
  type HolidayAdminGroup,
} from './holiday-dialogs';
import { EmployeeSelectionsTable } from './employee-selections-table';
import { PageShell } from '../layout/page-shell';

/**
 * The holiday calendar and administration workspace.
 *
 * Supports mandatory holidays, optional/floating holiday pools, annual allowance configuration,
 * consolidated from-to multi-day plans, and viewing employee selections roster.
 */
export function ScreenHolidays() {
  const holidays = useHolidays();
  const [editingGroup, setEditingGroup] = useState<HolidayAdminGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiringGroup, setRetiringGroup] = useState<HolidayAdminGroup | null>(null);
  const [inspectingGroup, setInspectingGroup] = useState<HolidayAdminGroup | null>(null);
  const [configuringAllowance, setConfiguringAllowance] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'OPTIONAL' | 'SELECTIONS'>('ALL');

  // Group holidays by Plan Name, Scope, Type, and Active status
  const holidayGroups = useMemo(() => {
    const map = new Map<string, HolidayAdminGroup>();

    for (const h of holidays.holidays) {
      const key = `${h.name.trim()}__${h.isOptional}__${h.branchId ?? 'org'}__${h.isActive}`;
      if (!map.has(key)) {
        map.set(key, {
          name: h.name.trim(),
          isOptional: h.isOptional,
          branchId: h.branchId ?? null,
          isActive: h.isActive,
          startDate: h.holidayDate.slice(0, 10),
          endDate: h.holidayDate.slice(0, 10),
          totalDays: 0,
          holidays: [],
        });
      }
      const grp = map.get(key)!;
      grp.holidays.push(h);
    }

    const result: HolidayAdminGroup[] = [];
    for (const grp of map.values()) {
      const sorted = [...grp.holidays].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
      grp.holidays = sorted;
      grp.startDate = sorted[0]?.holidayDate.slice(0, 10) ?? '';
      grp.endDate = sorted[sorted.length - 1]?.holidayDate.slice(0, 10) ?? '';
      grp.totalDays = sorted.length;
      result.push(grp);
    }

    return result.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [holidays.holidays]);

  // Selections lookup per holiday ID
  const selectionsByHolidayId = useMemo(() => {
    const map = new Map<string, number>();
    for (const sel of holidays.selections) {
      if (sel.status === 'CONFIRMED' || sel.status === 'PENDING') {
        map.set(sel.holidayId, (map.get(sel.holidayId) ?? 0) + 1);
      }
    }
    return map;
  }, [holidays.selections]);

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

  const activeGroups = holidayGroups.filter((g) => g.isActive);
  const optionalGroupCount = activeGroups.filter((g) => g.isOptional).length;
  const mandatoryGroupCount = activeGroups.filter((g) => !g.isOptional).length;

  const tabs = [
    { id: 'ALL', label: 'All holidays', count: holidayGroups.length },
    { id: 'OPTIONAL', label: 'Restricted holidays', count: optionalGroupCount },
    { id: 'SELECTIONS', label: 'Employee choices', count: holidays.selections.length },
  ];

  const displayedGroups =
    activeTab === 'OPTIONAL' ? holidayGroups.filter((g) => g.isOptional) : holidayGroups;

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScreenHeader
          description={`${mandatoryGroupCount} public${optionalGroupCount ? ` · ${optionalGroupCount} optional` : ''} in ${holidays.year}`}
          icon={CalendarDays}
          title="Holiday calendar"
          tone="success"
        />
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Input
            min={2000}
            max={2100}
            step={1}
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
                Restricted holidays allowed: {holidays.settings.optionalHolidayAllowance}
                {holidays.employeePolicies.length > 0
                  ? ` · ${holidays.employeePolicies.length} exception${holidays.employeePolicies.length === 1 ? '' : 's'}`
                  : ''}
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
          {displayedGroups.length === 0 ? (
            <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm font-bold text-foreground">
                {activeTab === 'OPTIONAL'
                  ? 'No optional holidays configured'
                  : `No holidays in ${holidays.year}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === 'OPTIONAL'
                  ? 'Add holidays with the "Optional holiday" flag to create an optional holiday pool.'
                  : 'Leave requests spanning this year are charged for every working day until a holiday is added.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
              <table className="stack-table stack-wide w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-border bg-table-header">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-bold">Date Range</th>
                    <th className="px-4 py-2.5 font-bold">Holiday</th>
                    <th className="px-4 py-2.5 font-bold">Type</th>
                    <th className="px-4 py-2.5 font-bold">Scope</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    <th className="px-4 py-2.5 font-bold">Employee choices</th>
                    <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedGroups.map((group) => {
                    const isMultiDay = group.totalDays > 1;
                    const groupSelectionCount = group.holidays.reduce(
                      (sum, h) => sum + (selectionsByHolidayId.get(h.id) ?? 0),
                      0,
                    );

                    return (
                      <tr
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/40 cursor-default"
                        key={`${group.name}-${group.startDate}-${group.isOptional}`}
                      >
                        {/* Date column (From → To format in one line) */}
                        <td
                          data-bare=""
                          data-label="Date Range"
                          className="px-4 py-3 font-mono text-foreground"
                        >
                          <div className="flex items-center gap-2">
                            <span>
                              {isMultiDay
                                ? formatDateRange(group.startDate, group.endDate)
                                : formatDate(group.startDate)}
                            </span>
                            {isMultiDay ? (
                              <Badge
                                variant="secondary"
                                className="font-semibold text-[10px] px-1.5 py-0 h-4"
                              >
                                {group.totalDays} Days
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-sans">
                                (1 day)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Holiday Plan Name */}
                        <td data-cell="primary" className="px-4 py-3 font-semibold text-foreground">
                          {group.name}
                        </td>

                        {/* Type */}
                        <td data-bare="" data-label="Type" className="px-4 py-3">
                          {group.isOptional ? (
                            <Badge
                              variant="outline"
                              className="border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium"
                            >
                              Restricted
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="font-medium">
                              Mandatory
                            </Badge>
                          )}
                        </td>

                        {/* Scope */}
                        <td
                          data-bare=""
                          data-label="Scope"
                          className="px-4 py-3 text-muted-foreground"
                        >
                          {group.branchId ? 'One branch' : 'Whole organization'}
                        </td>

                        {/* Status */}
                        <td data-cell="status" data-label="Status" className="px-4 py-3">
                          <Badge variant={group.isActive ? 'success' : 'secondary'}>
                            {group.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>

                        {/* Employee Selections */}
                        <td data-bare="" data-label="Employee Selections" className="px-4 py-3">
                          {group.isOptional ? (
                            <button
                              type="button"
                              onClick={() => setInspectingGroup(group)}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                              title="Click to view employees who selected this holiday"
                            >
                              <Users className="h-3.5 w-3.5" />
                              <span>{groupSelectionCount} selected</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td data-cell="actions" className="px-4 py-3 text-right">
                          {holidays.canWrite && group.isActive && (
                            <div className="flex justify-end items-center gap-2">
                              {group.isOptional && (
                                <Button
                                  onClick={() => setInspectingGroup(group)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  className="h-7 text-xs text-primary hover:bg-primary/10"
                                >
                                  Who selected
                                </Button>
                              )}
                              <Button
                                onClick={() => setEditingGroup(group)}
                                size="sm"
                                type="button"
                                variant="outline"
                                className="h-7 text-xs"
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => setRetiringGroup(group)}
                                size="sm"
                                type="button"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              >
                                Deactivate
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {optionalGroupCount > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Each employee may pick up to {holidays.settings.optionalHolidayAllowance} optional
              days a year.
            </p>
          )}
        </>
      )}

      {/* Holiday Dialog for adding or renaming grouped plans */}
      <HolidayDialog
        holidayGroup={editingGroup}
        holidays={holidays}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditingGroup(null);
          }
        }}
        open={creating || editingGroup !== null}
      />

      {/* Retire Holiday Dialog */}
      <RetireHolidayDialog
        holidayGroup={retiringGroup}
        holidays={holidays}
        onOpenChange={(open) => !open && setRetiringGroup(null)}
        open={retiringGroup !== null}
      />

      {/* Who Selected Modal */}
      <HolidaySelectionsDialog
        holidayGroup={inspectingGroup}
        onOpenChange={(open) => !open && setInspectingGroup(null)}
        open={inspectingGroup !== null}
        selections={holidays.selections}
      />

      {/* Allowance & Overrides Dialog */}
      <AllowanceDialog
        holidays={holidays}
        onOpenChange={(open) => !open && setConfiguringAllowance(false)}
        open={configuringAllowance}
      />
    </PageShell>
  );
}
