'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, CheckSquare, Sparkles, XCircle } from 'lucide-react';
import { Badge, Button } from '@smarteam/ui';
import type { Holiday, EmployeeHolidaySelection } from '@smarteam/contracts';
import { useEmployeeHolidays } from '../../hooks/use-employee-holidays';
import {
  AvailableHolidayPlanCard,
  formatDateDisplay,
  weekday,
  type HolidayPlanGroup,
} from './floating-holiday-plan-item';

interface SelectedPlanGroup {
  name: string;
  selections: EmployeeHolidaySelection[];
  startDate: string;
  endDate: string;
}

export function OptionalHolidaysCard() {
  const employeeHolidays = useEmployeeHolidays();
  const [checkedHolidayIds, setCheckedHolidayIds] = useState<Set<string>>(new Set());
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const {
    summary,
    allowance,
    selectedCount,
    remainingAllowance,
    optionalPool,
    selections,
    loading,
    error,
    saving,
    saveError,
    selectHolidays,
    cancelSelection,
    cancelMultipleSelections,
  } = employeeHolidays;

  const activeSelections = useMemo(
    () => selections.filter((s) => s.status === 'CONFIRMED'),
    [selections],
  );

  const selectedHolidayIds = useMemo(
    () => new Set(activeSelections.map((s) => s.holidayId)),
    [activeSelections],
  );

  const availablePool = useMemo(
    () => optionalPool.filter((h) => !selectedHolidayIds.has(h.id)),
    [optionalPool, selectedHolidayIds],
  );

  const availableGroups = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const hol of availablePool) {
      const planName = hol.name.trim() || 'Optional Holiday';
      if (!map.has(planName)) map.set(planName, []);
      map.get(planName)!.push(hol);
    }

    const groups: HolidayPlanGroup[] = [];
    for (const [name, hols] of map.entries()) {
      const sorted = [...hols].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
      const startDate = sorted[0]?.holidayDate.slice(0, 10) ?? '';
      const endDate = sorted[sorted.length - 1]?.holidayDate.slice(0, 10) ?? '';
      groups.push({ name, holidays: sorted, startDate, endDate, totalDays: sorted.length });
    }

    return groups.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [availablePool]);

  const selectedGroups = useMemo(() => {
    const map = new Map<string, EmployeeHolidaySelection[]>();
    for (const sel of activeSelections) {
      const planName = sel.holiday?.name.trim() || 'Optional Holiday';
      if (!map.has(planName)) map.set(planName, []);
      map.get(planName)!.push(sel);
    }

    const groups: SelectedPlanGroup[] = [];
    for (const [name, sels] of map.entries()) {
      const sorted = [...sels].sort((a, b) =>
        (a.holiday?.holidayDate ?? '').localeCompare(b.holiday?.holidayDate ?? ''),
      );
      const startDate = sorted[0]?.holiday?.holidayDate.slice(0, 10) ?? '';
      const endDate = sorted[sorted.length - 1]?.holiday?.holidayDate.slice(0, 10) ?? '';
      groups.push({ name, selections: sorted, startDate, endDate });
    }

    return groups.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [activeSelections]);

  if (!employeeHolidays.hasEmployeeRecord) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="py-4 text-center text-xs text-muted-foreground" role="status">
          Loading optional holiday allowance...
        </p>
      </div>
    );
  }

  if (error || !summary) return null;

  const toggleChecked = (id: string) => {
    setCheckedHolidayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePlanExpansion = (planName: string) => {
    setExpandedPlans((prev) => ({ ...prev, [planName]: !prev[planName] }));
  };

  const handleSelectChecked = async () => {
    const ids = Array.from(checkedHolidayIds).filter((id) =>
      availablePool.some((h) => h.id === id),
    );
    if (ids.length === 0) return;
    const ok = await selectHolidays(ids);
    if (ok) setCheckedHolidayIds(new Set());
  };

  const handleSelectAllGroup = async (group: HolidayPlanGroup) => {
    const ids = group.holidays.map((h) => h.id);
    const ok = await selectHolidays(ids);
    if (ok) {
      setCheckedHolidayIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleCancelGroup = async (group: SelectedPlanGroup) => {
    const ids = group.selections.map((s) => s.holidayId);
    if (ids.length === 1) {
      await cancelSelection(ids[0]!);
    } else {
      await cancelMultipleSelections(ids);
    }
  };

  const validCheckedCount = Array.from(checkedHolidayIds).filter((id) =>
    availablePool.some((h) => h.id === id),
  ).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      {/* Header with Allowance Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Optional Holidays ({employeeHolidays.year})
            </h3>
            <p className="text-xs text-muted-foreground">
              Select optional holidays from your eligible pool. Choose entire multi-day plans or
              pick specific custom days.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-xs font-semibold text-foreground">
              {selectedCount} of {allowance} Selected
            </span>
            <p className="text-[11px] text-muted-foreground">
              {remainingAllowance > 0
                ? `${remainingAllowance} ${remainingAllowance === 1 ? 'choice' : 'choices'} remaining`
                : 'Annual allowance reached'}
            </p>
          </div>
          <Badge
            variant={remainingAllowance > 0 ? 'warning' : 'secondary'}
            className="text-xs px-2.5 py-1 font-semibold"
          >
            {remainingAllowance > 0 ? `${remainingAllowance} Available` : 'Allowance Full'}
          </Badge>
        </div>
      </div>

      {saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {saveError}
        </p>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Active Selections */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Your Selected Holidays ({activeSelections.length})
          </h4>

          {activeSelections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="text-xs font-medium text-foreground">
                No optional holidays selected yet.
              </p>
              {allowance > 0 && availablePool.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Browse available holiday plans on the right to select all days or customize.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedGroups.map((group) => {
                const isMultiDay = group.selections.length > 1;
                return (
                  <div
                    key={group.name}
                    className="rounded-lg border border-success/30 bg-success/5 dark:bg-success/10 p-3 space-y-2.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground truncate">
                            {group.name}
                          </span>
                          {isMultiDay && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-medium"
                            >
                              {group.selections.length} Days Selected
                            </Badge>
                          )}
                        </div>
                        {isMultiDay && (
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {formatDateDisplay(group.startDate)} →{' '}
                            {formatDateDisplay(group.endDate)}
                          </div>
                        )}
                      </div>

                      <Button
                        disabled={saving}
                        onClick={() =>
                          isMultiDay
                            ? handleCancelGroup(group)
                            : cancelSelection(group.selections[0]!.holidayId)
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        {isMultiDay ? `Cancel Plan (${group.selections.length})` : 'Cancel'}
                      </Button>
                    </div>

                    {isMultiDay ? (
                      <div className="border-t border-success/20 pt-2 space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Selected Dates:
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {group.selections.map((sel) => {
                            const dateStr = sel.holiday?.holidayDate.slice(0, 10) ?? '';
                            return (
                              <div
                                key={sel.id}
                                className="flex items-center justify-between rounded-md border border-success/20 bg-card/70 px-2.5 py-1.5 text-xs"
                              >
                                <span className="font-mono text-foreground font-medium">
                                  {dateStr} · {weekday(dateStr)}
                                </span>
                                <Button
                                  disabled={saving}
                                  onClick={() => cancelSelection(sel.holidayId)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                                >
                                  Cancel day
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {group.startDate} · {weekday(group.startDate)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Available Optional Pool */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Available Optional Pool ({availablePool.length})
            </h4>

            {validCheckedCount > 0 && (
              <Button
                disabled={saving || validCheckedCount > remainingAllowance}
                onClick={handleSelectChecked}
                size="sm"
                type="button"
                className="h-7 text-xs gap-1.5"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Select ({validCheckedCount}) Checked
              </Button>
            )}
          </div>

          {availableGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="text-xs font-medium text-foreground">
                {optionalPool.length === 0
                  ? 'No optional holidays configured in your calendar pool.'
                  : 'All available optional holidays have been selected.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
              {availableGroups.map((group) => (
                <AvailableHolidayPlanCard
                  key={group.name}
                  checkedHolidayIds={checkedHolidayIds}
                  group={group}
                  isExpanded={expandedPlans[group.name] ?? true}
                  onConfirmChecked={async (ids) => {
                    const ok = await selectHolidays(ids);
                    if (ok) {
                      setCheckedHolidayIds((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => next.delete(id));
                        return next;
                      });
                    }
                  }}
                  onSelectAllGroup={handleSelectAllGroup}
                  onSelectSingle={(id) => selectHolidays([id])}
                  onToggleChecked={toggleChecked}
                  onToggleExpansion={() => togglePlanExpansion(group.name)}
                  remainingAllowance={remainingAllowance}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const FloatingHolidaysCard = OptionalHolidaysCard;
