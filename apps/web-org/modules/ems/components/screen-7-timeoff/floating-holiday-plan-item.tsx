'use client';

import React from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Badge, Button, Checkbox } from '@smarteam/ui';
import type { Holiday } from '@smarteam/contracts';

export interface HolidayPlanGroup {
  name: string;
  holidays: Holiday[];
  startDate: string;
  endDate: string;
  totalDays: number;
}

export function weekday(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '';
  const dateStr = isoDate.slice(0, 10);
  const parts = dateStr.split('-');
  const part0 = parts[0];
  const part1 = parts[1];
  const part2 = parts[2];
  if (parts.length === 3 && part0 && part1 && part2) {
    const y = parseInt(part0, 10);
    const m = parseInt(part1, 10) - 1;
    const d = parseInt(part2, 10);
    const dt = new Date(Date.UTC(y, m, d));
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  return dateStr;
}

export function AvailableHolidayPlanCard({
  group,
  isExpanded,
  remainingAllowance,
  saving,
  checkedHolidayIds,
  onToggleExpansion,
  onToggleChecked,
  onSelectAllGroup,
  onSelectSingle,
  onConfirmChecked,
}: {
  group: HolidayPlanGroup;
  isExpanded: boolean;
  remainingAllowance: number;
  saving: boolean;
  checkedHolidayIds: Set<string>;
  onToggleExpansion: () => void;
  onToggleChecked: (id: string) => void;
  onSelectAllGroup: (group: HolidayPlanGroup) => void;
  onSelectSingle: (id: string) => void;
  onConfirmChecked: (ids: string[]) => void;
}) {
  const isMultiDay = group.totalDays > 1;
  const canSelectAll = remainingAllowance >= group.totalDays && !saving;
  const groupCheckedCount = group.holidays.filter((h) => checkedHolidayIds.has(h.id)).length;

  return (
    <div className="rounded-lg border border-border bg-card hover:border-primary/40 transition-colors p-3.5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">{group.name}</span>
            {isMultiDay ? (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 font-semibold shrink-0"
              >
                <Layers className="mr-1 h-2.5 w-2.5" />
                {group.totalDays} Days Plan
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0 text-muted-foreground"
              >
                1 Day
              </Badge>
            )}
          </div>

          {isMultiDay ? (
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {formatDateDisplay(group.startDate)} → {formatDateDisplay(group.endDate)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {group.startDate} · {weekday(group.startDate)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isMultiDay ? (
            <>
              <Button
                disabled={!canSelectAll}
                onClick={() => onSelectAllGroup(group)}
                size="sm"
                type="button"
                className="h-7 text-xs px-2.5 font-medium"
              >
                Select all ({group.totalDays} days)
              </Button>
              <Button
                onClick={onToggleExpansion}
                size="sm"
                type="button"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label={isExpanded ? 'Collapse plan details' : 'Expand plan details'}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </>
          ) : (
            <Button
              disabled={remainingAllowance < 1 || saving}
              onClick={() => onSelectSingle(group.holidays[0]!.id)}
              size="sm"
              type="button"
              variant="outline"
              className="h-7 text-xs px-3"
            >
              Select
            </Button>
          )}
        </div>
      </div>

      {isMultiDay && isExpanded && (
        <div className="rounded-md border border-border/80 bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-foreground">
              Or choose custom days individually:
            </span>
            {groupCheckedCount > 0 && (
              <span className="text-primary font-medium">
                {groupCheckedCount} of {group.totalDays} selected
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {group.holidays.map((hol) => {
              const dateStr = hol.holidayDate.slice(0, 10);
              const isChecked = checkedHolidayIds.has(hol.id);
              const canPickSingle = remainingAllowance > 0 && !saving;

              return (
                <div
                  key={hol.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={isChecked}
                      disabled={saving}
                      onCheckedChange={() => onToggleChecked(hol.id)}
                    />
                    <span className="font-mono text-foreground font-medium">{dateStr}</span>
                    <span className="text-muted-foreground">· {weekday(dateStr)}</span>
                  </label>

                  <Button
                    disabled={!canPickSingle}
                    onClick={() => onSelectSingle(hol.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
                  >
                    Select this day
                  </Button>
                </div>
              );
            })}
          </div>

          {groupCheckedCount > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground">
                {groupCheckedCount} custom {groupCheckedCount === 1 ? 'day' : 'days'} checked
              </span>
              <Button
                disabled={saving || groupCheckedCount > remainingAllowance}
                onClick={() => {
                  const ids = group.holidays
                    .map((h) => h.id)
                    .filter((id) => checkedHolidayIds.has(id));
                  onConfirmChecked(ids);
                }}
                size="sm"
                type="button"
                className="h-6 text-[11px] px-2.5"
              >
                Confirm Selected ({groupCheckedCount})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
