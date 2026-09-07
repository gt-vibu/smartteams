'use client';

import React from 'react';
import { Calendar, CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { Badge, Button } from '@smarteam/ui';
import { useEmployeeHolidays } from '../../hooks/use-employee-holidays';

function weekday(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
}

export function FloatingHolidaysCard() {
  const employeeHolidays = useEmployeeHolidays();

  if (!employeeHolidays.hasEmployeeRecord) {
    return null;
  }

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
  } = employeeHolidays;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="py-4 text-center text-xs text-muted-foreground" role="status">
          Loading floating holiday allowance...
        </p>
      </div>
    );
  }

  if (error || !summary) {
    return null;
  }

  const selectedHolidayIds = new Set(
    selections.filter((s) => s.status === 'CONFIRMED').map((s) => s.holidayId),
  );

  const availablePool = optionalPool.filter((h) => !selectedHolidayIds.has(h.id));
  const activeSelections = selections.filter((s) => s.status === 'CONFIRMED');

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
              Floating / Optional Holidays ({employeeHolidays.year})
            </h3>
            <p className="text-xs text-muted-foreground">
              Select optional holidays from your eligible pool. Selected dates become holidays for
              you and are excluded from charged leave.
            </p>
          </div>
        </div>

        {/* Allowance Badge & Usage */}
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
            className="text-xs px-2.5 py-1"
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

      {/* Main Content: Selected Holidays and Available Pool */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Active Selections */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Your Selected Holidays ({activeSelections.length})
          </h4>

          {activeSelections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">No floating holidays selected yet.</p>
              {allowance > 0 && availablePool.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Choose from the available pool on the right.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {activeSelections.map((sel) => {
                const hol = sel.holiday;
                const dateStr = hol?.holidayDate ? hol.holidayDate.slice(0, 10) : '';
                return (
                  <div
                    key={sel.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-success/30 bg-success/5 dark:bg-success/10 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        {hol?.name ?? 'Optional Holiday'}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {dateStr} · {weekday(dateStr)}
                      </div>
                    </div>
                    <Button
                      disabled={saving}
                      onClick={() => cancelSelection(sel.holidayId)}
                      size="sm"
                      type="button"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Available Optional Pool */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            Available Optional Pool ({availablePool.length})
          </h4>

          {availablePool.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {optionalPool.length === 0
                  ? 'No optional holidays configured in your calendar pool.'
                  : 'All available optional holidays have been selected.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {availablePool.map((hol) => {
                const dateStr = hol.holidayDate.slice(0, 10);
                const canSelect = remainingAllowance > 0 && !saving;
                return (
                  <div
                    key={hol.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground">{hol.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {dateStr} · {weekday(dateStr)}
                      </div>
                    </div>
                    <Button
                      disabled={!canSelect}
                      onClick={() => selectHolidays([hol.id])}
                      size="sm"
                      type="button"
                      variant="outline"
                      className="h-8 text-xs"
                    >
                      Select
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
