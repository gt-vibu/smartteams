'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Calendar,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from '@smarteam/ui';
import type { Holiday, EmployeeHolidayPolicy } from '@smarteam/contracts';
import type { HolidaysState } from '../../hooks/use-holidays';

export interface HolidayAdminGroup {
  name: string;
  isOptional: boolean;
  branchId: string | null;
  isActive: boolean;
  startDate: string;
  endDate: string;
  totalDays: number;
  holidays: Holiday[];
}

/**
 * shadcn-style DatePicker using Radix Popover and shadcn Calendar.
 */
export function ShadcnDatePicker({
  id,
  value,
  onChange,
  disabled,
  min,
  max,
  placeholder = 'Select date',
}: {
  id?: string;
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const displayFormatted = useMemo(() => {
    if (!value) return null;
    const parts = value.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0] || '2026', 10);
      const m = parseInt(parts[1] || '1', 10) - 1;
      const d = parseInt(parts[2] || '1', 10);
      const dt = new Date(y, m, d);
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return value;
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-1 text-xs text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <span className={!displayFormatted ? 'text-muted-foreground' : 'font-medium'}>
            {displayFormatted || placeholder}
          </span>
          <svg
            className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1.5 opacity-70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 z-[70] border-border bg-card shadow-2xl">
        <Calendar
          value={value}
          onChange={(date) => {
            onChange(date);
            setOpen(false);
          }}
          min={min}
          max={max}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Create or update a per-employee holiday policy.
 */
export function EmployeePolicyDialog({
  holidays,
  existingPolicy,
  optionalHolidays,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  existingPolicy: EmployeeHolidayPolicy | null;
  optionalHolidays: Holiday[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [employeeId, setEmployeeId] = useState(existingPolicy?.employeeId ?? '');
  const [useCustomAllowance, setUseCustomAllowance] = useState(
    existingPolicy?.allowanceOverride != null,
  );
  const [customAllowance, setCustomAllowance] = useState(existingPolicy?.allowanceOverride ?? 2);
  const [useRestrictedPool, setUseRestrictedPool] = useState(
    (existingPolicy?.restrictedHolidayIds.length ?? 0) > 0,
  );
  const [restrictedIds, setRestrictedIds] = useState<Set<string>>(
    new Set(existingPolicy?.restrictedHolidayIds ?? []),
  );

  useEffect(() => {
    if (!open) return;
    setEmployeeId(existingPolicy?.employeeId ?? '');
    setUseCustomAllowance(existingPolicy?.allowanceOverride != null);
    setCustomAllowance(existingPolicy?.allowanceOverride ?? 2);
    setUseRestrictedPool((existingPolicy?.restrictedHolidayIds.length ?? 0) > 0);
    setRestrictedIds(new Set(existingPolicy?.restrictedHolidayIds ?? []));
  }, [existingPolicy, open]);

  const toggleHolidayId = (id: string) => {
    setRestrictedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeId.trim()) return;

    const ok = await holidays.upsertEmployeePolicy(employeeId.trim(), {
      allowanceOverride: useCustomAllowance ? Math.max(0, Math.min(365, customAllowance)) : null,
      restrictedHolidayIds: useRestrictedPool ? [...restrictedIds] : [],
    });

    if (ok) onOpenChange(false);
  };

  const isEditing = Boolean(existingPolicy);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>
          {isEditing ? 'Edit employee holiday override' : 'Add employee holiday override'}
        </DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Override the global settings for a specific employee. Leave fields at their defaults to
          inherit from the organization.
        </p>

        <form className="mt-4 space-y-5" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="policy-employee-id">
              Employee ID
            </Label>
            {isEditing ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {existingPolicy?.employee
                  ? `${existingPolicy.employee.firstName} ${existingPolicy.employee.lastName} (${existingPolicy.employee.employeeNumber})`
                  : existingPolicy?.employeeId}
              </div>
            ) : (
              <>
                <Input
                  disabled={holidays.saving}
                  id="policy-employee-id"
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Paste employee UUID"
                  value={employeeId}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Paste the employee's UUID from the People directory.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Custom allowance</p>
                <p className="text-[11px] text-muted-foreground">
                  Override the org-wide limit for this employee
                </p>
              </div>
              <Switch
                checked={useCustomAllowance}
                disabled={holidays.saving}
                onCheckedChange={setUseCustomAllowance}
              />
            </div>

            {useCustomAllowance && (
              <div className="mt-2 flex items-center gap-3">
                <Input
                  className="w-24"
                  disabled={holidays.saving}
                  max={365}
                  min={0}
                  onChange={(e) => setCustomAllowance(Number.parseInt(e.target.value || '0', 10))}
                  type="number"
                  value={customAllowance}
                />
                <span className="text-xs text-muted-foreground">days / year</span>
              </div>
            )}
            {!useCustomAllowance && (
              <p className="text-[11px] text-muted-foreground">
                Employee will use the global org allowance.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Restrict holiday pool</p>
                <p className="text-[11px] text-muted-foreground">
                  Assign specific optional holidays to this employee
                </p>
              </div>
              <Switch
                checked={useRestrictedPool}
                disabled={holidays.saving}
                onCheckedChange={(checked) => {
                  setUseRestrictedPool(checked);
                  if (!checked) setRestrictedIds(new Set());
                }}
              />
            </div>

            {useRestrictedPool && (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {optionalHolidays.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No optional holidays in the pool for the current year.
                  </p>
                ) : (
                  optionalHolidays.map((h) => (
                    <label
                      key={h.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <Checkbox
                        checked={restrictedIds.has(h.id)}
                        disabled={holidays.saving}
                        onCheckedChange={() => toggleHolidayId(h.id)}
                      />
                      <span className="font-mono text-muted-foreground">{h.holidayDate}</span>
                      <span className="text-foreground">{h.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
            {!useRestrictedPool && (
              <p className="text-[11px] text-muted-foreground">
                Employee sees the full org/branch optional holiday pool.
              </p>
            )}
          </div>

          {holidays.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {holidays.saveError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              disabled={holidays.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={holidays.saving || !employeeId.trim()} type="submit">
              {holidays.saving ? 'Saving...' : isEditing ? 'Update override' : 'Save override'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
