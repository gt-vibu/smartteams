'use client';

import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
} from '@smarteam/ui';
import { Calendar, ChevronLeft, ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useEmployeeHolidays } from '../../hooks/use-employee-holidays';
import { PageShell } from '../layout/page-shell';
import type { Holiday } from '@smarteam/contracts';

function formatHolidayDate(dateStr: string) {
  try {
    const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
    return {
      formatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
    };
  } catch {
    return { formatted: dateStr, dayName: '' };
  }
}

interface UnifiedHolidayItem {
  id: string;
  holidayDate: string;
  name: string;
  isOptional: boolean;
  typeLabel: 'Public Holiday' | 'Optional Holiday';
  statusLabel: 'Required' | 'Selected' | 'Available';
  isSelected: boolean;
}

/**
 * ScreenEmployeeHolidays
 *
 * Single, unified enterprise Holiday Calendar table combining Public/Company
 * and Optional holidays with contextual Apply actions and backend allowance enforcement.
 */
export function ScreenEmployeeHolidays() {
  const employeeHolidays = useEmployeeHolidays();
  const currentYearNum = Number.parseInt(employeeHolidays.year, 10) || new Date().getFullYear();

  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PUBLIC' | 'OPTIONAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REQUIRED' | 'AVAILABLE' | 'SELECTED'>(
    'ALL',
  );
  const [holidayToApply, setHolidayToApply] = useState<Holiday | null>(null);

  const handlePrevYear = () => {
    employeeHolidays.setYear(String(currentYearNum - 1));
  };

  const handleNextYear = () => {
    employeeHolidays.setYear(String(currentYearNum + 1));
  };

  // Build unified holiday dataset
  const unifiedHolidays: UnifiedHolidayItem[] = useMemo(() => {
    const selectedIds = new Set(
      employeeHolidays.selections
        .filter((s) => s.status === 'CONFIRMED' || s.status === 'PENDING')
        .map((s) => s.holidayId),
    );

    const mandatoryItems: UnifiedHolidayItem[] = employeeHolidays.mandatoryHolidays.map((h) => ({
      id: h.id,
      holidayDate: h.holidayDate,
      name: h.name,
      isOptional: false,
      typeLabel: 'Public Holiday',
      statusLabel: 'Required',
      isSelected: false,
    }));

    const optionalItems: UnifiedHolidayItem[] = employeeHolidays.optionalPool.map((h) => {
      const isSelected = selectedIds.has(h.id);
      return {
        id: h.id,
        holidayDate: h.holidayDate,
        name: h.name,
        isOptional: true,
        typeLabel: 'Optional Holiday',
        statusLabel: isSelected ? 'Selected' : 'Available',
        isSelected,
      };
    });

    return [...mandatoryItems, ...optionalItems].sort((a, b) =>
      a.holidayDate.localeCompare(b.holidayDate),
    );
  }, [
    employeeHolidays.mandatoryHolidays,
    employeeHolidays.optionalPool,
    employeeHolidays.selections,
  ]);

  const filteredHolidays = useMemo(() => {
    return unifiedHolidays.filter((item) => {
      if (typeFilter === 'PUBLIC' && item.isOptional) return false;
      if (typeFilter === 'OPTIONAL' && !item.isOptional) return false;

      if (statusFilter === 'REQUIRED' && item.statusLabel !== 'Required') return false;
      if (statusFilter === 'AVAILABLE' && item.statusLabel !== 'Available') return false;
      if (statusFilter === 'SELECTED' && item.statusLabel !== 'Selected') return false;

      return true;
    });
  }, [unifiedHolidays, typeFilter, statusFilter]);

  const handleConfirmApply = async () => {
    if (!holidayToApply) return;
    const success = await employeeHolidays.selectHolidays([holidayToApply.id]);
    if (success !== false) {
      setHolidayToApply(null);
    }
  };

  return (
    <div className="flex w-full flex-col">
      {/* Context Top Header */}
      <div className="sticky top-[var(--ems-context-bar-height)] z-20 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6 py-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-foreground">Holiday Calendar</h2>
            <p className="text-xs text-muted-foreground">
              Official company holiday calendar and your applicable optional holidays for{' '}
              {employeeHolidays.year}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrevYear}
              className="h-8 px-2.5 text-xs cursor-pointer"
              title="Previous Year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-mono text-xs font-semibold px-2">{employeeHolidays.year}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleNextYear}
              className="h-8 px-2.5 text-xs cursor-pointer"
              title="Next Year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <PageShell>
        <div className="space-y-4">
          {/* Top Summary Metric Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-3.5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Public Holidays</p>
                <p className="text-lg font-bold text-foreground">
                  {employeeHolidays.mandatoryHolidays.length} Days
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3.5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Optional Allowance</p>
                <p className="text-lg font-bold text-foreground">
                  {employeeHolidays.selectedCount} / {employeeHolidays.allowance} Chosen
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({employeeHolidays.remainingAllowance} remaining)
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3.5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success/10 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Total Holiday Benefit
                </p>
                <p className="text-lg font-bold text-foreground">
                  {employeeHolidays.mandatoryHolidays.length + employeeHolidays.selectedCount} Days
                </p>
              </div>
            </div>
          </div>

          {/* Compact Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="w-36 text-xs h-8"
              >
                <option value="ALL">All Types</option>
                <option value="PUBLIC">Public Holidays</option>
                <option value="OPTIONAL">Optional Holidays</option>
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="w-36 text-xs h-8"
              >
                <option value="ALL">All Statuses</option>
                <option value="REQUIRED">Required</option>
                <option value="AVAILABLE">Available</option>
                <option value="SELECTED">Selected</option>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {filteredHolidays.length} holiday{filteredHolidays.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Error Banner */}
          {employeeHolidays.saveError && (
            <div className="flex items-center justify-between p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <span>{employeeHolidays.saveError}</span>
              <button
                type="button"
                onClick={employeeHolidays.dismissError}
                className="font-bold hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Unified Holiday Table */}
          {filteredHolidays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="text-xs font-semibold text-foreground">No holidays found</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                No holidays match the selected criteria for {employeeHolidays.year}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
              <table className="stack-table w-full min-w-[650px] text-left text-xs">
                <thead className="border-b border-border bg-table-header">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Day</th>
                    <th className="px-4 py-2.5 font-bold">Holiday</th>
                    <th className="px-4 py-2.5 font-bold">Type</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    <th className="px-4 py-2.5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHolidays.map((item) => {
                    const { formatted, dayName } = formatHolidayDate(item.holidayDate);

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td
                          data-label="Date"
                          className="px-4 py-3 font-mono font-medium text-foreground"
                        >
                          {formatted}
                        </td>
                        <td data-label="Day" className="px-4 py-3 text-muted-foreground">
                          {dayName}
                        </td>
                        <td data-cell="primary" className="px-4 py-3 font-semibold text-foreground">
                          {item.name}
                        </td>
                        <td data-label="Type" className="px-4 py-3">
                          <Badge
                            variant={item.isOptional ? 'outline' : 'secondary'}
                            className={`text-[10px] font-medium ${
                              item.isOptional
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
                                : ''
                            }`}
                          >
                            {item.typeLabel}
                          </Badge>
                        </td>
                        <td data-label="Status" className="px-4 py-3">
                          {item.statusLabel === 'Required' && (
                            <span className="text-muted-foreground text-[11px] font-medium">
                              Required
                            </span>
                          )}
                          {item.statusLabel === 'Selected' && (
                            <Badge variant="success" className="text-[10px]">
                              Selected
                            </Badge>
                          )}
                          {item.statusLabel === 'Available' && (
                            <span className="text-slate-600 dark:text-slate-400 text-[11px] font-medium">
                              Available
                            </span>
                          )}
                        </td>
                        <td data-cell="actions" className="px-4 py-3 text-right">
                          {!item.isOptional && (
                            <span className="text-muted-foreground font-mono">—</span>
                          )}
                          {item.isOptional && item.isSelected && (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                Applied
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void employeeHolidays.cancelSelection(item.id)}
                                disabled={employeeHolidays.saving}
                                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                Withdraw
                              </Button>
                            </div>
                          )}
                          {item.isOptional && !item.isSelected && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const holidayObj = employeeHolidays.optionalPool.find(
                                  (h) => h.id === item.id,
                                );
                                if (holidayObj) setHolidayToApply(holidayObj);
                              }}
                              disabled={
                                employeeHolidays.saving || employeeHolidays.remainingAllowance <= 0
                              }
                              className="h-7 px-3 text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                              title={
                                employeeHolidays.remainingAllowance <= 0
                                  ? 'Allowance limit reached'
                                  : 'Apply for this optional holiday'
                              }
                            >
                              Apply
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageShell>

      {/* Apply Optional Holiday Confirmation Dialog */}
      <Dialog
        open={Boolean(holidayToApply)}
        onOpenChange={(open) => !open && setHolidayToApply(null)}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-sm font-semibold">Apply for Optional Holiday</DialogTitle>
          </DialogHeader>

          {holidayToApply && (
            <div className="space-y-3 p-5 text-xs">
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
                <p className="font-semibold text-foreground text-sm">{holidayToApply.name}</p>
                <p className="font-mono text-muted-foreground">
                  {formatHolidayDate(holidayToApply.holidayDate).formatted} (
                  {formatHolidayDate(holidayToApply.holidayDate).dayName})
                </p>
              </div>

              <p className="text-muted-foreground">
                Select this holiday for your optional holiday allocation.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Remaining allowance: <strong>{employeeHolidays.remainingAllowance}</strong> of{' '}
                <strong>{employeeHolidays.allowance}</strong> days.
              </p>

              <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHolidayToApply(null)}
                  disabled={employeeHolidays.saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleConfirmApply()}
                  disabled={employeeHolidays.saving}
                >
                  {employeeHolidays.saving ? 'Applying...' : 'Apply'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
