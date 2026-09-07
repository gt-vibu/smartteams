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
  Textarea,
} from '@smarteam/ui';
import type { Holiday, EmployeeHolidayPolicy } from '@smarteam/contracts';
import type { HolidaysState } from '../../hooks/use-holidays';

/**
 * shadcn-style DatePicker using Radix Popover and shadcn Calendar.
 */
function ShadcnDatePicker({
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
 * Adds a holiday (single day or multi-day range), or renames one.
 *
 * When adding, the user can pick a Start Date and an optional End Date.
 * If both are set and End Date > Start Date, one holiday row is created
 * per calendar day in the range (e.g. Diwali: Oct 20–22 → 3 rows).
 *
 * The date is not editable when renaming, because the date and branch form
 * the uniqueness key and past leave requests were charged against it.
 */
export function HolidayDialog({
  holidays,
  holiday,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday: Holiday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isOptional, setIsOptional] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(holiday?.name ?? '');
    setStartDate(holiday ? holiday.holidayDate.slice(0, 10) : '');
    setEndDate('');
    setIsOptional(holiday?.isOptional ?? false);
  }, [holiday, open]);

  // Compute the days that will be created
  const dayCount = useMemo(() => {
    if (!startDate) return 0;
    if (!endDate || endDate <= startDate) return 1;
    const s = new Date(`${startDate}T00:00:00Z`);
    const e = new Date(`${endDate}T00:00:00Z`);
    return Math.min(365, Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1);
  }, [startDate, endDate]);

  const isRange = endDate && endDate > startDate;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    let ok: unknown;
    if (holiday) {
      ok = await holidays.renameHoliday(holiday.id, { name: name.trim(), isOptional });
    } else if (startDate) {
      if (isRange) {
        ok = await holidays.createHolidayRange(
          { name: name.trim(), isOptional },
          startDate,
          endDate,
        );
      } else {
        ok = await holidays.createHoliday({
          name: name.trim(),
          holidayDate: startDate,
          isOptional,
        });
      }
    }
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{holiday ? 'Rename holiday' : 'Add a holiday'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="holiday-name">
              Name
            </Label>
            <Input
              autoFocus
              disabled={holidays.saving}
              id="holiday-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Diwali"
              value={name}
            />
          </div>

          {holiday ? (
            <p className="text-[11px] text-muted-foreground">
              {startDate} · the date cannot be changed, because leave already charged against it was
              calculated from it.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Start date */}
              <div>
                <Label
                  className="mb-1 block text-xs font-semibold text-foreground"
                  htmlFor="holiday-start"
                >
                  Date
                </Label>
                <ShadcnDatePicker
                  disabled={holidays.saving}
                  id="holiday-start"
                  onChange={setStartDate}
                  placeholder="Pick date"
                  value={startDate}
                />
              </div>

              {/* End date — spans a multi-day holiday */}
              <div>
                <Label className="mb-1 flex items-center justify-between" htmlFor="holiday-end">
                  <span className="text-xs font-semibold text-foreground">End date</span>
                  <span className="font-normal text-[11px] text-muted-foreground">
                    optional · leave blank for a single day
                  </span>
                </Label>
                <ShadcnDatePicker
                  disabled={holidays.saving || !startDate}
                  id="holiday-end"
                  min={startDate}
                  onChange={setEndDate}
                  placeholder={startDate ? 'Pick end date' : 'Select date first'}
                  value={endDate}
                />
              </div>

              {/* Range preview chip */}
              {startDate && (
                <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Creates:</span>
                  <span className="font-semibold text-foreground">
                    {dayCount} day{dayCount !== 1 ? 's' : ''}
                  </span>
                  {isRange && (
                    <span className="text-muted-foreground">
                      {startDate} → {endDate}
                    </span>
                  )}
                  {dayCount > 14 && (
                    <span className="ml-auto rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">
                      large range
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              checked={isOptional}
              disabled={holidays.saving}
              onChange={(event) => setIsOptional(event.target.checked)}
              type="checkbox"
            />
            Optional holiday (adds to the floating pool)
          </label>

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
            <Button
              disabled={holidays.saving || (!holiday && !startDate) || name.trim().length < 2}
              type="submit"
            >
              {holidays.saving
                ? 'Saving...'
                : !holiday && isRange
                  ? `Add ${dayCount} days`
                  : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Retires a holiday. The API requires a reason and keeps the row. */
export function RetireHolidayDialog({
  holidays,
  holiday,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday: Holiday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!holiday || reason.trim().length < 2) return;
    const ok = await holidays.retireHoliday(holiday.id, reason.trim());
    if (ok) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Retire {holiday?.name ?? 'holiday'}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          The holiday stops applying to future leave calculations. Leave already approved keeps the
          days it was charged.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Label className="block" htmlFor="holiday-retire-reason">
            Reason
          </Label>
          <Textarea
            disabled={holidays.saving}
            id="holiday-retire-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
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
            <Button disabled={holidays.saving || reason.trim().length < 2} type="submit">
              {holidays.saving ? 'Retiring...' : 'Retire'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Configures the optional holiday allowance.
 *
 * Shows:
 *  1. Global org-wide allowance (numeric input, 0-365).
 *  2. Per-employee override list — each override card shows the employee name, their
 *     allowance override (or "global"), and the number of restricted holidays (or "All").
 *  3. An "Add / edit per-employee override" button that opens EmployeePolicyDialog.
 */
export function AllowanceDialog({
  holidays,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [allowance, setAllowance] = useState(holidays.settings.optionalHolidayAllowance);
  const [editingPolicy, setEditingPolicy] = useState<EmployeeHolidayPolicy | null | undefined>(
    undefined,
  ); // undefined = closed, null = new, object = existing

  useEffect(() => {
    if (open) {
      setAllowance(holidays.settings.optionalHolidayAllowance);
      setEditingPolicy(undefined);
    }
  }, [open, holidays.settings]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const val = Math.max(0, Math.min(365, allowance));
    const ok = await holidays.updateAllowance(val);
    if (ok) {
      onOpenChange(false);
    }
  };

  const optionalHolidays = holidays.holidays.filter((h) => h.isOptional && h.isActive);
  const overrideCount = holidays.employeePolicies.length;

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Configure Floating Holiday Allowance</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Set the maximum optional/floating holidays each employee can select per calendar year.
            You can also set per-employee overrides below.
          </p>

          <form className="mt-4 space-y-5" onSubmit={submit}>
            {/* ── Global allowance ── */}
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Global Default (all employees)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  className="w-28"
                  disabled={holidays.saving}
                  id="optional-holiday-allowance"
                  min={0}
                  max={365}
                  onChange={(event) => setAllowance(Number.parseInt(event.target.value || '0', 10))}
                  type="number"
                  value={allowance}
                />
                <span className="text-xs text-muted-foreground">days / year per employee</span>
              </div>
              {/* Visual bar */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (allowance / 365) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {allowance} of 365 days selected
              </p>
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
              <Button disabled={holidays.saving || allowance < 0} type="submit">
                {holidays.saving ? 'Saving...' : 'Save Global Allowance'}
              </Button>
            </div>
          </form>

          {/* ── Per-employee overrides section ── */}
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Per-Employee Overrides
                {overrideCount > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    {overrideCount}
                  </span>
                )}
              </p>
              <Button
                onClick={() => setEditingPolicy(null)}
                size="sm"
                type="button"
                variant="outline"
              >
                + Add override
              </Button>
            </div>

            {holidays.employeePolicies.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                No per-employee overrides. All employees use the global allowance and the full
                optional holiday pool.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {holidays.employeePolicies.map((policy) => (
                  <li
                    key={policy.employeeId}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {policy.employee
                          ? `${policy.employee.firstName} ${policy.employee.lastName}`
                          : policy.employeeId}
                      </p>
                      <p className="text-muted-foreground">
                        Allowance:{' '}
                        <span className="font-medium text-foreground">
                          {policy.allowanceOverride != null
                            ? `${policy.allowanceOverride}d`
                            : 'Global default'}
                        </span>
                        {' · '}
                        Pool:{' '}
                        <span className="font-medium text-foreground">
                          {policy.restrictedHolidayIds.length > 0
                            ? `${policy.restrictedHolidayIds.length} specific`
                            : 'All'}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingPolicy(policy)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                      <Button
                        disabled={holidays.saving}
                        onClick={() => void holidays.deleteEmployeePolicy(policy.employeeId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested dialog for editing per-employee policy */}
      {editingPolicy !== undefined && (
        <EmployeePolicyDialog
          existingPolicy={editingPolicy}
          holidays={holidays}
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditingPolicy(undefined);
          }}
          open
          optionalHolidays={optionalHolidays}
        />
      )}
    </>
  );
}

/**
 * Create or update a per-employee holiday policy.
 *
 * Controls:
 * - Employee selector (from policies already in memory or a text field for new)
 * - Toggle: use global allowance / custom allowance
 * - If custom: numeric input (0-365)
 * - Toggle: full pool / restricted pool
 * - If restricted: checkbox list of optional holidays
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
          {/* Employee ID (read-only if editing, text input if new) */}
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

          {/* Allowance override */}
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

          {/* Pool restriction */}
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
